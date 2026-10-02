// Synthetic partner stock exports for tests and the trial. Same STRUCTURE as the
// "Stock Report Of Batch-wise Products" from MediVision Platinum (Allied Softtech,
// Pune) that Nootan Pharmaceuticals uses — title block, heading row, product name
// only on a product's first batch row, a "Totals:" line after each product, a grand
// total and a "Generated at … using MediVision Platinum" footer — but every name,
// batch, price and quantity here is made up. No real business data.
//
//   node test/fixtures/partnerStockFile.mjs     # rewrites the sample files next to this script
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);
const ExcelJS = require('exceljs');

export const MEDIVISION_HEADERS = ['Product name', 'Unit', 'Com', 'Shelf', 'Tax%', 'StkIn dt', 'Batch no', 'ExpDt',
  'Purc rate', 'PTR', 'MRP', 'Sale rate 1', 'Qty', 'Value'];

const utcDate = (iso) => new Date(`${iso}T00:00:00Z`);
const pad = (n) => String(n).padStart(2, '0');
const ddmmyy = (d) => `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${String(d.getUTCFullYear()).slice(2)}`;

/**
 * products: [{ name, unit, com, tax, batches: [{ batch, exp: 'YYYY-MM-DD', purc, ptr, mrp, sale, qty }] }]
 * Returns the .xlsx as a Buffer (in memory).
 */
export async function buildMediVisionWorkbook(products, { company = 'DEMO PARTNER PHARMACY (DEMO)', asOn = new Date() } = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Report');
  const banner = (text) => { const r = ws.addRow([text]); ws.mergeCells(r.number, 1, r.number, MEDIVISION_HEADERS.length); };
  ws.addRow([]);
  banner(company);
  banner('DEMO address — not a real shop, Panchavati, Nashik 422003');
  banner('Ph: 0000000000');
  banner('Email: demo@example.com');
  ws.addRow([]);
  banner('Stock Report Of Batch-wise Products Expiring On Or Before 31-12-30');
  banner(`as on ${ddmmyy(asOn)}`);
  ws.addRow(MEDIVISION_HEADERS);
  let grandQty = 0;
  let grandValue = 0;
  for (const p of products) {
    let qty = 0;
    let value = 0;
    p.batches.forEach((b, i) => {
      const v = Math.round((b.purc ?? 0) * b.qty * 100) / 100;
      ws.addRow([
        i === 0 ? p.name : null, i === 0 ? p.unit : null, i === 0 ? p.com : null, i === 0 ? (p.shelf ?? 'A1') : null,
        p.tax, utcDate(b.stockIn ?? '2026-06-01'), b.batch, b.exp ? utcDate(b.exp) : null,
        b.purc ?? null, b.ptr ?? null, b.mrp ?? null, b.sale != null ? `      ${Number(b.sale).toFixed(2)}` : null, b.qty, v,
      ]);
      qty += b.qty; value += v;
    });
    const t = new Array(MEDIVISION_HEADERS.length).fill(null);
    t[11] = 'Totals:'; t[12] = qty; t[13] = Math.round(value * 100) / 100;
    ws.addRow(t);
    grandQty += qty; grandValue += value;
  }
  const g = new Array(MEDIVISION_HEADERS.length).fill(null);
  g[11] = 'Totals:'; g[12] = grandQty; g[13] = Math.round(grandValue * 100) / 100;
  ws.addRow(g);
  banner(`Generated at ${asOn.toISOString().slice(0, 19).replace('T', ' ')} by DEMO using MediVision Platinum`);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** A plain CSV export (one row per batch, every row named) with generic headings. */
export function buildGenericCsv(products) {
  const head = ['Item Code', 'Item Name', 'Pack', 'Batch No', 'Exp', 'MRP', 'Rate', 'Qty', 'Free', 'HSN', 'GST%'];
  const lines = [head.join(',')];
  const q = (s) => (/[",]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s ?? ''));
  for (const p of products) {
    for (const b of p.batches) {
      const [y, m] = (b.exp ?? '').split('-');
      lines.push([p.code ?? '', p.name, p.unit, b.batch, b.exp ? `${m}/${y.slice(2)}` : '', b.mrp ?? '', b.sale ?? '', b.qty, b.free ?? 0, p.hsn ?? '', p.tax]
        .map(q).join(','));
    }
  }
  return Buffer.from(lines.join('\r\n') + '\r\n', 'utf8');
}

// Demo trial sample: items the demo partner lists (match), made-up brands (request
// as new products), and lines with problems (expired, no batch, rate above MRP).
export const DEMO_SAMPLE = [
  { name: 'PARACETAMOL 500MG TAB', unit: '15 TAB', com: 'DEMO', tax: 5, code: 'NP-0001', hsn: '30049099', batches: [
    { batch: 'DPA2611', exp: '2028-11-01', purc: 18.5, ptr: 21.43, mrp: 30, sale: 26, qty: 40 },
    { batch: 'DPA2702', exp: '2029-02-01', purc: 18.5, ptr: 21.43, mrp: 30, sale: 26, qty: 25 },
  ] },
  { name: 'CETIRIZINE 10MG TAB', unit: '10 TAB', com: 'DEMO', tax: 5, code: 'NP-0002', batches: [
    { batch: 'DCT2604', exp: '2028-04-01', purc: 12, ptr: 15.71, mrp: 22, sale: 19, qty: 30 },
  ] },
  { name: 'VITAMIN C 500MG CHEWABLE TAB', unit: '15 TAB', com: 'DEMO', tax: 5, code: 'NP-0003', batches: [
    { batch: 'DVC2709', exp: '2028-09-01', purc: 20, ptr: 22.86, mrp: 32, sale: 28, qty: 18 },
  ] },
  { name: 'FEBRINOL 650 TAB', unit: '10 TAB', com: 'ZYX-L', tax: 5, code: 'NP-0004', batches: [
    { batch: 'FB24A', exp: '2028-06-01', purc: 20, ptr: 23.5, mrp: 33, sale: 30, qty: 60 },
  ] },
  { name: 'CARDIOVEX 2.5MG INJ', unit: 'VIAL', com: 'QRS-H', tax: 12, code: 'NP-0005', batches: [
    { batch: 'CV1102', exp: '2027-12-01', purc: 410, ptr: 480, mrp: 640, sale: 600, qty: 4 },
  ] },
  { name: 'ACIDOFREE 40MG TAB', unit: '15 TAB', com: 'ZYX-L', tax: 5, code: 'NP-0006', batches: [
    { batch: 'AF2301', exp: '2025-03-01', purc: 60, ptr: 70, mrp: 98, sale: 90, qty: 7 },
  ] },
  { name: 'GLUCORA 500MG SR TAB', unit: '10 TAB', com: 'QRS-H', tax: 12, code: 'NP-0007', batches: [
    { batch: '', exp: '2028-01-01', purc: 30, ptr: 34, mrp: 48, sale: 52, qty: 12 },
  ] },
];

const here = path.dirname(fileURLToPath(import.meta.url));
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const asOn = new Date(Date.UTC(2026, 9, 2, 13, 0, 0));
  fs.writeFileSync(path.join(here, 'partner-stock-sample-medivision.xlsx'), await buildMediVisionWorkbook(DEMO_SAMPLE, { asOn }));
  fs.writeFileSync(path.join(here, 'partner-stock-sample.csv'), buildGenericCsv(DEMO_SAMPLE));
  console.log('Wrote partner-stock-sample-medivision.xlsx and partner-stock-sample.csv');
}
