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

/**
 * RFC 4180-style parsing: quoted cells may hold the separator, quotes ("") and line breaks.
 * Stops once maxRows + 1 rows are read, so a file of millions of empty lines never
 * becomes millions of arrays (the caller refuses a file over the limit; Sprint 34 review).
 */
export function parseDelimited(text: string, d = detectDelimiter(text), maxRows = Infinity): string[][] {
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
      if (rows.length > maxRows) return rows.map((r) => r.map((c) => c.trim()));
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

// Opening / closing table, row and cell tags. [^<>]* never runs past the next "<", so
// the scan is linear even for a file full of unclosed tags (the earlier lazy
// [\s\S]*? patterns re-scanned to the end of the file for each one: a few MB of "<tr"
// kept the API busy for minutes — security review Sprint 34).
const TAG = /<(\/?)(table|tr|td|th)\b([^<>]*)>/gi;
const cellText = (html: string) => decodeEntities(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^<>]*>/g, '')).replace(/\s+/g, ' ').trim();

/** Rows of the first table: one array per <tr>, one cell per <td>/<th>; colspan repeats blanks. */
export function parseHtmlTable(html: string, maxRows = Infinity): string[][] {
  const rows: string[][] = [];
  let inTable = false;
  let row: string[] | null = null;
  let cell: { from: number; span: number } | null = null;
  const closeCell = (at: number) => {
    if (!cell || !row) { cell = null; return; }
    row.push(cellText(html.slice(cell.from, at)));
    for (let i = 1; i < Math.min(cell.span, 50); i++) row.push('');
    cell = null;
  };
  const closeRow = (at: number) => { closeCell(at); if (row) rows.push(row); row = null; };
  TAG.lastIndex = 0;
  for (let m = TAG.exec(html); m; m = TAG.exec(html)) {
    const [, slash, nameRaw, attrs] = m;
    const name = nameRaw.toLowerCase();
    if (name === 'table') {
      if (!slash && !inTable) { inTable = true; continue; }
      if (slash && inTable) { closeRow(m.index); break; }   // the first table only
      continue;
    }
    if (!inTable) continue;
    if (name === 'tr') {
      closeRow(m.index);
      if (!slash) row = [];
      if (rows.length > maxRows) break;
      continue;
    }
    // td / th
    if (slash) { closeCell(m.index); continue; }
    closeCell(m.index);
    if (!row) row = [];
    cell = { from: m.index + m[0].length, span: Number(attrs.match(/colspan\s*=\s*["']?(\d+)/i)?.[1] ?? 1) };
  }
  if (inTable) closeRow(html.length);
  // No <table> at all: read the rows anyway (the earlier parser did the same)
  if (!inTable && !rows.length && /<tr\b/i.test(html)) return parseHtmlTable(`<table>${html}</table>`, maxRows);
  return rows;
}
