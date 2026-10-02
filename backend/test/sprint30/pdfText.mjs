// The text of a PDF made by pdfkit, for checks like "this invoice prints Form 20B: …".
// pdfkit compresses each content stream (Flate) and writes text as hex glyph strings in
// TJ arrays with the standard (WinAnsi) encoding, so inflating the streams and decoding
// the hex strings of each TJ gives the printed lines. Nothing is written to disk.
import zlib from 'zlib';

export function pdfText(buf) {
  const src = buf.toString('latin1');
  const out = [];
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(src))) {
    const start = m.index + m[0].length;
    const end = src.indexOf('endstream', start);
    if (end < 0) break;
    const raw = Buffer.from(src.slice(start, end), 'latin1');
    let text;
    try { text = zlib.inflateSync(raw).toString('latin1'); } catch { continue; }
    for (const tj of text.matchAll(/\[([^\]]*)\]\s*TJ/g)) {
      out.push([...tj[1].matchAll(/<([0-9a-fA-F]+)>/g)].map((h) => Buffer.from(h[1], 'hex').toString('latin1')).join(''));
    }
  }
  return out.join('\n');
}
