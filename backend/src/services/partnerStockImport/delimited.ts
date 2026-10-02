// Text exports: CSV / TSV / semicolon or pipe separated, and the HTML tables some
// billing software saves with an .xls name. Pure (no I/O): unit-tested.

const DELIMITERS = [',', '\t', ';', '|'];

/** UTF-8 (with or without BOM), falling back to Windows-1252/Latin-1 when the bytes are not UTF-8. */
export function decodeText(buf: Buffer): string {
  let s = buf.toString('utf8');
  if (s.includes('�')) s = buf.toString('latin1');
  return s.replace(/^﻿/, '');
}

/** The separator that splits the first lines most consistently. */
export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 30);
  let best = ',';
  let bestScore = 0;
  for (const d of DELIMITERS) {
    const counts = lines.map((l) => splitLine(l, d).length);
    const max = Math.max(0, ...counts);
    if (max < 2) continue;
    // Rows with the most common width count most (headings and data rows share it)
    const freq = new Map<number, number>();
    counts.forEach((c) => freq.set(c, (freq.get(c) ?? 0) + 1));
    const [width, n] = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    const score = width > 1 ? n * width : 0;
    if (score > bestScore) { best = d; bestScore = score; }
  }
  return best;
}

function splitLine(line: string, d: string): string[] {
  return parseDelimited(line, d)[0] ?? [];
}

/** RFC 4180-style parsing: quoted cells may hold the separator, quotes ("") and line breaks. */
export function parseDelimited(text: string, d = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell.trim() === '') { quoted = true; cell = ''; continue; }
    if (ch === d) { row.push(cell); cell = ''; continue; }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
      continue;
    }
    cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim()));
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Whether the text is an HTML table export (often named .xls). */
export const looksLikeHtml = (text: string) => /<table[\s>]/i.test(text.slice(0, 20000));

/** Rows of the first table: one array per <tr>, one cell per <td>/<th>; colspan repeats blanks. */
export function parseHtmlTable(html: string): string[][] {
  const table = html.match(/<table[\s\S]*?<\/table>/i)?.[0] ?? html;
  const rows: string[][] = [];
  for (const tr of table.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells: string[] = [];
    for (const m of tr.matchAll(/<t([dh])([^>]*)>([\s\S]*?)<\/t\1>/gi)) {
      const text = decodeEntities(m[3].replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
      cells.push(text);
      const span = Number(m[2].match(/colspan\s*=\s*["']?(\d+)/i)?.[1] ?? 1);
      for (let i = 1; i < Math.min(span, 50); i++) cells.push('');
    }
    rows.push(cells);
  }
  return rows;
}
