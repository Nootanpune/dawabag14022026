// Readiness, catalogue import, final records, accountant reports, saved
// prescription reuse, cold-chain dispatch and the incident register
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { API, call, check, q } from '../sprint5/lib.mjs';
import { PIN, markPaid } from './fixtures.mjs';
import { releaseForPacking } from '../support/pharmacistCheck.mjs';

const require = createRequire(import.meta.url);
const ExcelJS = require('exceljs');
const { Client } = require('pg');
const here = path.dirname(fileURLToPath(import.meta.url));

// The real template, with SKUs renamed S6-… and a manufacturer-address column added
async function workbook({ addressFor = () => 'Plot 1, Pharma Park, Mumbai 400001' } = {}) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.resolve(here, '../../../templates/01_Medicine_and_Inventory.xlsx'));
  const master = wb.getWorksheet('1_Medicine_Master');
  master.getRow(5).getCell(31).value = 'Manufacturer Address';
  for (let r = 7; r <= master.rowCount; r++) {
    const sku = master.getRow(r).getCell(3).value;
    if (!sku) continue;
    master.getRow(r).getCell(3).value = `S6-${sku}`;
    master.getRow(r).getCell(31).value = addressFor(String(sku));
  }
  const stock = wb.getWorksheet('2_Opening_Inventory');
  for (let r = 7; r <= stock.rowCount; r++) {
    const sku = stock.getRow(r).getCell(1).value;
    if (sku) stock.getRow(r).getCell(1).value = `S6-${sku}`;
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function upload(pathname, token, buffer) {
  const form = new FormData();
  form.append('file', new Blob([buffer]), 'catalogue.xlsx');
  const res = await fetch(API + pathname, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

export async function runOperations({ t, P, addr, ids }) {
  console.log('Readiness');
  let r = await fetch(API.replace('/api/v1', '') + '/ready');
  check('/ready reports database and Redis', r.status === 200 && (await r.json()).checks?.database === 'ok');

  console.log('Catalogue import');
  const file = await workbook({ addressFor: (sku) => (sku === 'PARA500' ? '' : 'Plot 1, Pharma Park, Mumbai 400001') });
  r = await upload('/catalogue/import/preview', t.buyer, file);
  check('only admins can import', r.status === 403, r.json);
  r = await upload('/catalogue/import/preview', t.admin, file);
  const pv = r.json.data;
  check('preview reads every medicine and batch', pv?.products?.length >= 6 && pv?.batches?.length >= 6, pv?.summary);
  const ins = pv?.batches?.find((b) => b.sku === 'S6-INSGL3ML');
  check('expired opening stock is refused', ins?.action === 'error' && /expired/.test(ins.errors.join()), ins);
  const para = pv?.products?.find((p) => p.sku === 'S6-PARA500');
  check('a medicine without manufacturer address is imported inactive (C-17)', para?.record?.is_active === false && para.warnings.length > 0, para);
  r = await upload('/catalogue/import/commit', t.admin, file);
  check('commit refused while rows have errors', r.status === 422, r.json);
  const n0 = (await q(`SELECT COUNT(*)::int AS n FROM products WHERE sku LIKE 'S6-%'`))[0].n;
  r = await upload('/catalogue/import/commit?skip_errors=true', t.admin, file);
  const n1 = (await q(`SELECT COUNT(*)::int AS n FROM products WHERE sku LIKE 'S6-%'`))[0].n;
  check('valid rows imported in one go', r.status === 200 && n1 - n0 === r.json.data.summary.products.create && n1 > n0, { r: r.json, n0, n1 });
  // Atorvastatin: the template's one sample batch still in date (01/2027)
  const ato = (await q(`SELECT p.mrp_paise, p.offer_price_paise, p.ptr_price_paise, p.content_status, p.net_quantity,
                               (SELECT SUM(quantity_available)::int FROM inventory_batches b WHERE b.product_id = p.id) AS stock
                        FROM products p WHERE sku = 'S6-ATO10TAB'`))[0];
  check('prices in paise, pack size as net quantity, copy waits for pharmacist, stock loaded', ato?.mrp_paise === 8500
    && ato.offer_price_paise === 6800 && ato.ptr_price_paise === 6970 && ato.net_quantity === '10mg / Strip of 15'
    && ato.content_status === 'pending_review' && ato.stock === 120, ato);
  r = await upload('/catalogue/import/preview', t.admin, file);
  check('re-importing the same file changes nothing and refuses duplicate batches',
    r.json.data?.summary?.products?.create === 0 && r.json.data.batches.every((b) => b.action === 'error'), r.json.data?.summary);

  r = await call('GET', '/products/admin/list?q=S6-PARA500&status=inactive', { token: t.admin });
  check('admin list finds inactive imports', r.json.data?.products?.some((p) => p.sku === 'S6-PARA500' && p.has_declarations === false), r.json.data);
  const atoId = (await q(`SELECT id FROM products WHERE sku = 'S6-ATO10TAB'`))[0].id;
  r = await call('GET', `/products/${atoId}/admin`, { token: t.admin });
  check('admin record carries trade prices and limits', r.json.data?.ptr_price_paise === 6970 && r.json.data?.min_order_qty_retailer >= 1 && !('search_vector' in r.json.data), r.json.data);
  r = await call('GET', `/products/${atoId}/admin`, { token: t.buyer });
  check('buyers cannot read the admin record', r.status === 403, r.json);

  console.log('Final records (C-34)');
  const raw = new Client({ connectionString: process.env.DATABASE_URL });   // a normal session, no maintenance flag
  await raw.connect();
  const tryQ = async (sql, p) => { try { await raw.query(sql, p); return 'ok'; } catch (e) { return e.message; } };
  r = await call('POST', '/orders', { token: t.buyer, body: { address_id: addr.buyer, pincode: PIN, items: [{ product_id: P.otc, quantity: 2 }] } });
  const ord = r.json.data.order;
  const shipId = (await q(`SELECT id FROM order_shipments WHERE order_id = $1`, [ord.id]))[0].id;
  check('invoice amounts cannot be edited', /final/.test(await tryQ(`UPDATE order_shipments SET total_paise = 1 WHERE id = $1`, [shipId])));
  check('invoiced lines cannot be edited', /final/.test(await tryQ(`UPDATE order_items SET unit_price_paise = 1 WHERE order_id = $1`, [ord.id])));
  check('invoice status can still move', (await tryQ(`UPDATE order_shipments SET courier_partner = 'X' WHERE id = $1`, [shipId])) === 'ok');
  check('audit log cannot be deleted', /final/.test(await tryQ(`DELETE FROM audit_logs WHERE id = (SELECT id FROM audit_logs LIMIT 1)`)));
  await call('POST', `/orders/${ord.id}/cancel`, { token: t.buyer, body: { reason: 'Test credit note' } });
  check('credit notes cannot be edited', /final/.test(await tryQ(`UPDATE credit_notes SET total_paise = 0 WHERE order_id = $1`, [ord.id])));
  await raw.end();

  console.log('Accountant reports (C-30, C-32)');
  const today = new Date().toISOString().slice(0, 10);
  r = await call('GET', `/accounts/reports/sales-register?from=${today}&to=${today}`, { token: t.admin });
  const inv = r.json.data?.rows?.find((x) => x.order_number === ord.order_number);
  check('sales register lists the invoice with tax split and place of supply', inv && inv.place_of_supply === 'Maharashtra'
    && Number(inv.cgst_paise) + Number(inv.sgst_paise) + Number(inv.taxable_paise) === Number(inv.total_paise), inv);
  r = await call('GET', `/accounts/reports/credit-notes?from=${today}&to=${today}`, { token: t.admin });
  check('credit-note register lists the cancellation', r.json.data?.rows?.some((x) => x.against_invoice === inv?.invoice_number), r.json.data?.rows?.length);
  r = await call('GET', `/accounts/reports/hsn-summary?from=${today}&to=${today}&format=csv`, { token: t.admin, raw: true });
  check('HSN summary as CSV', r.status === 200 && /text\/csv/.test(r.type) && r.buf.toString().startsWith('hsn_code,gst_rate'), r.status);
  for (const name of ['gstr1-summary', 'marketplace-tcs-tds']) {
    r = await call('GET', `/accounts/reports/${name}?from=${today}&to=${today}`, { token: t.admin });
    check(`${name} runs`, r.status === 200 && Array.isArray(r.json.data?.rows), r.json);
  }
  r = await call('GET', `/accounts/reports/sales-register?from=2024-01-01&to=${today}`, { token: t.admin });
  check('periods over 13 months refused', r.status === 400, r.json);
  r = await call('GET', `/accounts/reports/sales-register?from=${today}&to=${today}`, { token: t.pharmacist });
  check('only admins see accounts', r.status === 403, r.json);

  console.log('Saved prescription (C-08)');
  r = await call('POST', '/orders', { token: t.buyer2, body: { address_id: addr.buyer2, pincode: PIN, items: [{ product_id: P.rx, quantity: 2 }] } });
  const rx1 = r.json.data.order;
  await q(`UPDATE orders SET status = 'rx_pending' WHERE id = $1`, [rx1.id]);
  const rxId = (await q(`INSERT INTO prescriptions (user_id, order_id, s3_key, file_type) VALUES ($1, $2, 'test/s6.jpg', 'jpg') RETURNING id`, [ids.buyer2, rx1.id]))[0].id;
  r = await call('POST', `/fulfilment/prescriptions/${rxId}/verify`, { token: t.pharmacist, body: { prescriber_name: 'Dr. S6', prescriber_reg_no: 'MMC-S6-1',
    prescribed_on: today, patient_name: 'S6 Buyer Two', valid_days: 90, items: [{ product_id: P.rx, prescribed_qty: 6 }] } });
  check('prescription verified for 6 units', r.status === 200, r.json);
  r = await call('POST', '/orders', { token: t.buyer2, body: { address_id: addr.buyer2, pincode: PIN, items: [{ product_id: P.rx, quantity: 3 }] } });
  const rx2 = r.json.data.order;
  r = await call('POST', `/prescriptions/${rxId}/use-for-order`, { token: t.buyer, body: { order_id: rx2.id } });
  check("cannot offer someone else's prescription", r.status === 404, r.json);
  r = await call('POST', `/prescriptions/${rxId}/use-for-order`, { token: t.buyer2, body: { order_id: rx2.id } });
  check('buyer offers the saved prescription for a new order', r.status === 200 && r.json.data.status === 'awaiting_pharmacist', r.json);
  await q(`UPDATE orders SET status = 'rx_pending' WHERE id = $1`, [rx2.id]);
  r = await call('GET', '/fulfilment/queue?stage=rx', { token: t.pharmacist });
  check('pharmacist queue shows the offered prescription', r.json.data?.items?.find((i) => i.order_id === rx2.id)?.requested_prescription_id === rxId, r.json);
  r = await call('POST', '/orders', { token: t.buyer2, body: { address_id: addr.buyer2, pincode: PIN, items: [{ product_id: P.rx, quantity: 10 }] } });
  r = await call('POST', `/prescriptions/${rxId}/use-for-order`, { token: t.buyer2, body: { order_id: r.json.data.order.id } });
  check('a prescription that does not cover the quantity is refused', r.status === 400 && /does not cover/.test(r.json.message), r.json);

  console.log('Cold chain (C-25)');
  r = await call('POST', '/orders', { token: t.buyer, body: { address_id: addr.buyer, pincode: PIN, items: [{ product_id: P.cold, quantity: 1 }] } });
  const cold = r.json.data.order;
  await markPaid(cold.id, cold.total_paise);
  const cs = (await q(`SELECT id FROM order_shipments WHERE order_id = $1`, [cold.id]))[0].id;
  await releaseForPacking(call, t.pharmacist, cs);   // Sprint 35: pharmacist check first (C-08)
  await call('POST', `/fulfilment/shipments/${cs}/pack`, { token: t.packer });
  const disp = (extra) => call('POST', `/fulfilment/shipments/${cs}/dispatch`, { token: t.packer, body: { courier_partner: 'ColdEx', awb_number: 'S6COLD', seal_number: 'SEAL-S6C', ...extra } });
  r = await disp({});
  check('cold-chain dispatch needs temperature and logger', r.status === 400, r.json);
  r = await disp({ cold_chain_temp_c: 12, cold_chain_logger_id: 'LOG-1' });
  check('a pack above 8 °C cannot leave', r.status === 409, r.json);
  r = await disp({ cold_chain_temp_c: 5, cold_chain_logger_id: 'LOG-1' });
  const rec = (await q(`SELECT cold_chain_temp_c, cold_chain_logger_id FROM order_shipments WHERE id = $1`, [cs]))[0];
  check('dispatched at 5 °C with the logger recorded', r.status === 200 && Number(rec.cold_chain_temp_c) === 5 && rec.cold_chain_logger_id === 'LOG-1', rec);

  console.log('Security incidents (C-43)');
  const seven = new Date(Date.now() - 7 * 36e5).toISOString();
  r = await call('POST', '/compliance/incidents', { token: t.admin, body: { title: 'S6 Leaked test credential', category: 'unauthorised_access',
    severity: 'high', description: 'A staff password was found in a public paste.', personal_data_affected: true, detected_at: seven } });
  const inc = r.json.data;
  check('incident logged with a number and the 6-hour CERT-In deadline', r.status === 201 && /^SEC-\d{4}-\d{4}$/.test(inc?.incident_no || ''), r.json);
  r = await call('GET', `/compliance/incidents/${inc.id}`, { token: t.admin });
  check('an incident detected 7 hours ago shows CERT-In overdue', r.json.data?.cert_in_overdue === true, r.json.data);
  r = await call('PATCH', `/compliance/incidents/${inc.id}`, { token: t.admin, body: { cert_in_reported_at: new Date().toISOString() } });
  check('reporting to CERT-In needs the acknowledgement reference', r.status === 400, r.json);
  r = await call('PATCH', `/compliance/incidents/${inc.id}`, { token: t.admin, body: { status: 'closed', actions_taken: 'Password rotated, sessions revoked.' } });
  check('a personal-data breach cannot close before DPB and users are told', r.status === 400, r.json);
  const now = new Date().toISOString();
  r = await call('PATCH', `/compliance/incidents/${inc.id}`, { token: t.admin, body: { cert_in_reported_at: now, cert_in_reference: 'CERTIN-S6-1',
    dpb_notified_at: now, users_notified_at: now, status: 'closed', actions_taken: 'Password rotated, sessions revoked.' } });
  check('incident closed with all notices recorded', r.status === 200 && r.json.data.status === 'closed', r.json);
  r = await call('GET', '/compliance/incidents', { token: t.pharmacist });
  check('only admins see the incident register', r.status === 403, r.json);
}
