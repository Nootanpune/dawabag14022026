// GST period lock on purchase documents
import { call, check } from '../sprint5/lib.mjs';

const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

export async function runAccountsLock({ t, P, V }) {
  console.log('GST period lock');
  let r = await call('PUT', '/admin/settings/accounts.locked_until', { token: t.admin, body: { value: day(1) } });
  check('a future date cannot be locked', r.status === 422, r.status);
  r = await call('PUT', '/admin/settings/accounts.locked_until', { token: t.admin, body: { value: day(-3) } });
  check('accounts locks the filed period', r.status === 200, r.json);
  const receive = (date, inv) => call('POST', '/purchasing/receipts', { token: t.admin, body: { vendor_id: V, supplier_invoice_no: inv, supplier_invoice_date: date,
    lines: [{ product_id: P.otc, batch_number: `S13-${inv}`, expiry_date: day(500), quantity: 5, unit_cost_paise: 5000, printed_mrp_paise: 10000 }] } });
  r = await receive(day(-5), 'INV-OLD');
  check('a supplier invoice dated in the locked period is refused', r.status === 409 && /closed GST period/.test(r.json.message), r.json);
  r = await receive(day(0), 'INV-NEW');
  check('a current supplier invoice is received', r.status === 201, r.json);
  await call('PUT', '/admin/settings/accounts.locked_until', { token: t.admin, body: { value: null } });
}
