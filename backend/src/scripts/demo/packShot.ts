// src/scripts/demo/packShot.ts — a simple drawn pack shot (PNG) for a demo product:
// a carton in the category's colour with the generic name, strength and a "DEMO PACK"
// band, and a picture of the dosage form. No brand, logo or real artwork. Built with
// Node's zlib only (no image library); the PNG goes straight to the object store
// through the normal product-photo service, never to a local file.
import { deflateSync } from 'zlib';

type RGB = [number, number, number];
const W = 480, H = 480;

// 5×7 bitmap font: each glyph is 7 rows of 5 bits
const FONT: Record<string, string> = {
  A: '01110100011000111111100011000110001', B: '11110100011000111110100011000111110', C: '01110100011000010000100001000101110',
  D: '11100100101000110001100011001011100', E: '11111100001000011110100001000011111', F: '11111100001000011110100001000010000',
  G: '01110100011000010111100011000101111', H: '10001100011000111111100011000110001', I: '01110001000010000100001000010001110',
  J: '00111000100001000010000101001001100', K: '10001100101010011000101001001010001', L: '10000100001000010000100001000011111',
  M: '10001110111010110101100011000110001', N: '10001100011100110101100111000110001', O: '01110100011000110001100011000101110',
  P: '11110100011000111110100001000010000', Q: '01110100011000110001101011001001101', R: '11110100011000111110101001001010001',
  S: '01111100001000001110000010000111110', T: '11111001000010000100001000010000100', U: '10001100011000110001100011000101110',
  V: '10001100011000110001100010101000100', W: '10001100011000110101101011010101010', X: '10001100010101000100010101000110001',
  Y: '10001100010101000100001000010000100', Z: '11111000010001000100010001000011111',
  0: '01110100011001110101110011000101110', 1: '00100011000010000100001000010001110', 2: '01110100010000100010001000100011111',
  3: '11111000100010000010000011000101110', 4: '00010001100101010010111110001000010', 5: '11111100001111000001000011000101110',
  6: '00110010001000011110100011000101110', 7: '11111000010001000100010000100001000', 8: '01110100011000101110100011000101110',
  9: '01110100011000101111000010001001100', ' ': '00000000000000000000000000000000000', '.': '00000000000000000000000000110001100',
  ',': '00000000000000000000001100010001000', '%': '11000110010001000100010001001100011', '+': '00000001000010011111001000010000000',
  '/': '00000000010001000100010001000000000', '-': '00000000000000011111000000000000000', '(': '00010001000100001000010000010000010',
  ')': '01000001000001000010000100010001000', ':': '00000011000110000000011000110000000', '&': '01100100101010001000101011001001101',
};

const CATEGORY_COLOURS: Record<string, RGB> = {
  'Fever & pain': [214, 69, 65], Allergy: [52, 120, 198], Digestion: [46, 139, 87], Diabetes: [123, 84, 179],
  'Heart & BP': [196, 40, 92], Antibiotics: [217, 119, 6], Vitamins: [219, 165, 21], 'First aid': [20, 140, 150],
};

class Canvas {
  readonly px = Buffer.alloc(W * H * 3);
  constructor(bg: RGB) { this.rect(0, 0, W, H, bg); }
  set(x: number, y: number, c: RGB) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (Math.floor(y) * W + Math.floor(x)) * 3;
    this.px[i] = c[0]; this.px[i + 1] = c[1]; this.px[i + 2] = c[2];
  }
  rect(x: number, y: number, w: number, h: number, c: RGB) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c);
  }
  /** Any shape given by an inside(x, y) test over its bounding box */
  shape(x0: number, y0: number, x1: number, y1: number, c: RGB, inside: (x: number, y: number) => boolean) {
    for (let y = Math.floor(y0); y <= y1; y++) for (let x = Math.floor(x0); x <= x1; x++) if (inside(x + 0.5, y + 0.5)) this.set(x, y, c);
  }
  roundRect(x: number, y: number, w: number, h: number, r: number, c: RGB) {
    this.shape(x, y, x + w, y + h, c, (px, py) => {
      const dx = Math.max(x + r - px, 0, px - (x + w - r)), dy = Math.max(y + r - py, 0, py - (y + h - r));
      return dx * dx + dy * dy <= r * r;
    });
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB) {
    this.shape(cx - rx, cy - ry, cx + rx, cy + ry, c, (px, py) => ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1);
  }
  text(s: string, x: number, y: number, scale: number, c: RGB) {
    let cx = x;
    for (const ch of s.toUpperCase()) {
      const g = FONT[ch] ?? FONT[' '];
      for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
        if (g[row * 5 + col] === '1') this.rect(cx + col * scale, y + row * scale, scale, scale, c);
      }
      cx += 6 * scale;
    }
  }
  textWidth(s: string, scale: number) { return s.length * 6 * scale - scale; }
  centred(s: string, y: number, scale: number, c: RGB) { this.text(s, Math.round((W - this.textWidth(s, scale)) / 2), y, scale, c); }
}

const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => Math.round(a[i] * (1 - t) + b[i] * t)) as RGB;
const WHITE: RGB = [255, 255, 255];
const INK: RGB = [33, 41, 52];

function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const word of text.split(/\s+/)) {
    if (!cur) cur = word;
    else if ((cur + ' ' + word).length <= maxChars) cur += ' ' + word;
    else { lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].slice(0, maxChars - 1) + '.'; }
  return lines.map((l) => (l.length > maxChars ? l.slice(0, maxChars - 1) + '.' : l));
}

function drawForm(cv: Canvas, form: string, colour: RGB, cx: number, cy: number) {
  const dark = mix(colour, INK, 0.35), light = mix(colour, WHITE, 0.55);
  switch (form) {
    case 'capsule':
      for (const dx of [-55, 55]) {
        cv.roundRect(cx + dx - 45, cy - 18, 90, 36, 18, light);
        cv.roundRect(cx + dx - 45, cy - 18, 45, 36, 18, colour);
        cv.rect(cx + dx - 18, cy - 18, 18, 36, colour);
      }
      break;
    case 'liquid':
      cv.roundRect(cx - 26, cy - 62, 52, 22, 4, dark);
      cv.roundRect(cx - 50, cy - 42, 100, 100, 16, colour);
      cv.rect(cx - 38, cy - 10, 76, 40, WHITE);
      break;
    case 'tube':
      cv.roundRect(cx - 95, cy - 24, 170, 48, 10, colour);
      cv.rect(cx + 70, cy - 12, 30, 24, dark);
      cv.rect(cx - 95, cy - 24, 10, 48, dark);
      break;
    case 'sachet':
      cv.roundRect(cx - 60, cy - 55, 120, 110, 6, colour);
      for (let x = cx - 56; x < cx + 56; x += 8) { cv.rect(x, cy - 55, 4, 6, WHITE); cv.rect(x, cy + 49, 4, 6, WHITE); }
      cv.ellipse(cx, cy, 30, 30, light);
      break;
    case 'device':
      cv.roundRect(cx - 110, cy - 16, 200, 32, 16, colour);
      cv.roundRect(cx - 60, cy - 9, 70, 18, 4, light);
      cv.rect(cx + 90, cy - 4, 30, 8, dark);
      break;
    case 'pack':
      cv.roundRect(cx - 90, cy - 26, 180, 52, 8, light);
      cv.roundRect(cx - 30, cy - 26, 60, 52, 4, colour);
      break;
    default: // tablet: a blister of round tablets
      cv.roundRect(cx - 105, cy - 45, 210, 90, 10, mix(WHITE, [200, 205, 212], 0.6));
      for (const dx of [-70, -23, 23, 70]) for (const dy of [-20, 20]) cv.ellipse(cx + dx, cy + dy, 16, 16, dy < 0 ? light : WHITE);
  }
}

export interface PackShotInput { generic: string; name: string; net: string; category: string; form: string }

/** The pack as RGB pixels (exported for tests). */
export function drawPackShot(p: PackShotInput): Canvas {
  const colour = CATEGORY_COLOURS[p.category] ?? [80, 110, 140];
  const cv = new Canvas(mix(colour, WHITE, 0.88));
  cv.roundRect(66, 46, 356, 396, 18, mix(colour, INK, 0.5));    // shadow
  cv.roundRect(56, 36, 356, 396, 18, WHITE);                      // carton
  cv.roundRect(56, 36, 356, 70, 18, colour);                      // top band
  cv.rect(56, 80, 356, 26, colour);
  cv.centred('DEMO PACK', 56, 4, WHITE);
  // Strength and form: the name without the generic part, e.g. "500 MG TABLET"
  const rest = p.name.toUpperCase().startsWith(p.generic.toUpperCase()) ? p.name.slice(p.generic.length).trim() : '';
  const lines = wrap(p.generic.toUpperCase(), 16, 2);
  let y = 128;
  for (const l of lines) { cv.centred(l, y, 3, INK); y += 30; }
  for (const l of wrap(rest.toUpperCase(), 22, 2)) { cv.centred(l, y + 4, 2, mix(colour, INK, 0.3)); y += 22; }
  drawForm(cv, p.form, colour, 234, 330);
  cv.rect(56, 404, 356, 2, mix(colour, WHITE, 0.6));
  cv.centred(p.net.toUpperCase().slice(0, 26), 412, 2, INK);
  return cv;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** PNG bytes (8-bit RGB) of the demo pack shot. */
export function packShotPng(p: PackShotInput): Buffer {
  const { px } = drawPackShot(p);
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; px.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}
