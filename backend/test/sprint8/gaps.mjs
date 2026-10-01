// Receipts list filters and paging; destruction register as CSV
import { call, check } from '../sprint5/lib.mjs';

export async function runGaps({ t }) {
  console.log('Receipts list and destruction register export');
  let r = await call('GET', '/purchasing/receipts?page=1&limit=2', { token: t.packer });
  check('receipts list is paged with a total', r.status === 200 && Array.isArray(r.json.data.receipts) && r.json.data.receipts.length <= 2
    && typeof r.json.data.total === 'number' && r.json.data.limit === 2, r.json.data);
  r = await call('GET', '/purchasing/receipts?q=NO-SUCH-INVOICE-S8', { token: t.packer });
  check('search by GRN or supplier invoice number', r.status === 200 && r.json.data.total === 0, r.json.data);
  r = await call('GET', '/purchasing/receipts?from=2026-02-01&to=2026-01-01', { token: t.packer });
  check('reversed date range refused', r.status === 400, r.json);
  r = await call('GET', '/purchasing/receipts?limit=1000', { token: t.packer });
  check('page size capped', r.status === 422, r.status);
  r = await call('GET', '/stock/destruction-register?format=csv', { token: t.packer, raw: true });
  const head = r.buf?.toString('utf8').split('\n')[0] || '';
  check('destruction register downloads as CSV', r.status === 200 && /text\/csv/.test(r.type) && head.startsWith('adjustment_no,product_name') && head.includes('disposal_witness'), head);
}
