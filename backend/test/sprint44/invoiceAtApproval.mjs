// Sprint 44 B — the tax invoice is issued at the pharmacist's approval (owner decision CONFIRMED
// 2026-10-03): numbering stays gap-free (an order changed or cancelled before approval takes no
// number), the invoice is dated by its issue, registers read that date, the database keeps an
// issued invoice final and refuses a credit note with no invoice; invoices issued before keep their
// numbers (C-30, C-46).
import { createRequire } from 'module';
import { call, check, q } from '../sprint5/lib.mjs';
import { checkoutPayment } from '../fakes/razorpay.mjs';
import { P, placeOrder, shipmentsOf, t, today } from '../sprint39/fixtures.mjs';

const require = createRequire(import.meta.url);
const { Client } = require('pg');

const fy = () => {
  const d = new Date(Date.now() + 5.5 * 3600e3);
  const y = d.getUTCMonth() + 1 >= 4 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${y}-${String(y + 1).slice(2)}`;
};
const lastDwb = async () => Number((await q(`SELECT last_number FROM invoice_series WHERE series_key = 'DWB' AND fy = $1`, [fy()]))[0]?.last_number ?? 0);
const numberOf = (inv) => Number(String(inv).split('/').pop());
const paidOrder = async (items) => {
  const { order } = await placeOrder(items, { withRx: false });
  const c = await call('POST', '/payments/create-order', { token: t.buyer, body: { order_id: order.id } });
  await call('POST', '/payments/verify', { token: t.buyer, body: checkoutPayment(c.json.data.razorpay_order_id, { status: 'captured' }) });
  return order;
};
async function apiLogin() {
  if (!process.env.DB_APP_LOGIN || !process.env.DB_APP_PASSWORD) return null;
  const u = new URL(process.env.DATABASE_URL);
  u.username = process.env.DB_APP_LOGIN; u.password = process.env.DB_APP_PASSWORD;
  const c = new Client({ connectionString: u.toString() });
  await c.connect();
  return c;
}
async function refused(client, sql, params) {
  try { await client.query(sql, params); return null; } catch (e) { return { code: e.code, message: e.message }; }
}

export async function runInvoiceAtApproval() {
  console.log('\nB. The tax invoice is issued at the pharmacist\'s approval; numbering stays gap-free');
  check('migration 39: every invoice issued before Sprint 44 keeps its number and is dated (issued at placement)',
    (await q(`SELECT COUNT(*)::int AS n FROM order_shipments WHERE invoice_number IS NOT NULL AND invoice_issued_at IS NULL`))[0].n === 0);
  const start = await lastDwb();
  const gone = await paidOrder([{ product_id: P.otc, quantity: 1 }]);
  check('placed and paid: no invoice number taken', (await lastDwb()) === start && !(await q(`SELECT invoice_number FROM order_shipments WHERE order_id = $1`, [gone.id]))[0].invoice_number);
  let r = await call('GET', `/invoices/shipments/${(await shipmentsOf(gone.id)).own}.pdf`, { token: t.buyer, raw: true });
  check('the invoice PDF does not exist yet (404 "issued when our pharmacist approves")', r.status === 404);
  r = await call('POST', `/orders/${gone.id}/cancel`, { token: t.buyer, body: { reason: 'S44 test: cancelled before approval' } });
  check('cancelled before approval: no credit note (no invoice to reverse) and no number used', r.status === 200 && r.json.data.credit_notes.length === 0
    && (await lastDwb()) === start, { r: r.json, last: await lastDwb() });

  const a = await paidOrder([{ product_id: P.otc, quantity: 1 }]);
  const b = await paidOrder([{ product_id: P.otc, quantity: 2 }]);
  const sa = (await shipmentsOf(a.id)).own, sb = (await shipmentsOf(b.id)).own;
  // Approved in the other order than placed: the numbers follow the approvals
  r = await call('POST', `/fulfilment/shipments/${sb}/check`, { token: t.pharmacist, body: { decision: 'release' } });
  const ib = r.json.data?.invoice_number;
  r = await call('POST', `/fulfilment/shipments/${sa}/check`, { token: t.pharmacist, body: { decision: 'release' } });
  const ia = r.json.data?.invoice_number;
  check('two approvals take the next two numbers, in the order approved, without a gap', numberOf(ib) === start + 1 && numberOf(ia) === start + 2
    && (await lastDwb()) === start + 2, { start, ib, ia });
  const rowA = (await q(`SELECT invoice_number, invoice_issued_at, total_paise, sale_identity_frozen_at, pharmacist_checked_at FROM order_shipments WHERE id = $1`, [sa]))[0];
  check('the order carries Dawabag\'s invoice number; the invoice is dated at the approval, with its sale record frozen then',
    (await q(`SELECT invoice_number FROM orders WHERE id = $1`, [a.id]))[0].invoice_number === ia
    && Math.abs(new Date(rowA.invoice_issued_at) - new Date(rowA.pharmacist_checked_at)) < 5000 && !!rowA.sale_identity_frozen_at, rowA);
  r = await call('GET', `/invoices/shipments/${sa}.pdf`, { token: t.buyer, raw: true });
  check('now the invoice PDF is there', r.status === 200 && r.type === 'application/pdf');
  r = await call('GET', `/accounts/reports/sales-register?from=${today()}&to=${today()}`, { token: t.opsAdmin });
  const reg = r.json.data?.rows ?? [];
  check('the sales register lists the issued invoices by issue date, and nothing for the order cancelled before approval',
    reg.some((x) => x.invoice_number === ia) && reg.some((x) => x.invoice_number === ib) && !reg.some((x) => x.order_number === gone.order_number), reg.length);
  r = await call('POST', `/fulfilment/shipments/${sa}/check`, { token: t.pharmacist, body: { decision: 'release' } });
  check('a second approval is refused; the number stays', r.status === 409 && (await q(`SELECT invoice_number FROM order_shipments WHERE id = $1`, [sa]))[0].invoice_number === ia);

  const api = await apiLogin();
  if (api) {
    try {
      let e = await refused(api, `UPDATE order_shipments SET invoice_number = NULL, invoice_issued_at = NULL WHERE id = $1`, [sa]);
      check('database (API login): an issued invoice keeps its number', e?.code === 'P0001' || e?.code === '23514', e);
      e = await refused(api, `UPDATE order_shipments SET total_paise = total_paise + 1 WHERE id = $1`, [sa]);
      check('… and its amounts', e?.code === 'P0001', e);
      e = await refused(api, `UPDATE order_items SET quantity = quantity + 1 WHERE shipment_id = $1`, [sa]);
      check('… and its lines', e?.code === 'P0001', e);
      const open = await paidOrder([{ product_id: P.otc, quantity: 1 }]);
      const so = (await shipmentsOf(open.id)).own;
      e = await refused(api, `INSERT INTO credit_notes (credit_note_number, shipment_id, order_id, reason, taxable_paise, total_paise)
                              VALUES ('S44-CN-X', $1, $2, 'cancellation', 1, 1)`, [so, open.id]);
      check('database: no credit note against a shipment that was never invoiced', e?.code === 'P0001' && /No tax invoice/.test(e.message), e);
      e = await refused(api, `UPDATE order_shipments SET pharmacist_check = 'released', pharmacist_name = 'S44 X', pharmacist_reg_no = 'X',
                              pharmacist_checked_at = NOW() WHERE id = $1`, [so]);
      const so2 = (await q(`SELECT invoice_number FROM order_shipments WHERE id = $1`, [so]))[0];
      check('database: any release, by any path, issues the invoice in the same statement', e === null && numberOf(so2.invoice_number) === start + 3, { e, so2 });
    } finally { await api.end(); }
  }
}
