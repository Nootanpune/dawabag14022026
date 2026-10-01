// Purchase returns to suppliers (C-28): two-person approval, stock out, supplier credit note, register
import { call, check, q } from '../sprint5/lib.mjs';

export async function runReturns({ t, V, B }) {
  const today = new Date().toISOString().slice(0, 10);
  const stock = async (b) => (await q(`SELECT quantity_available FROM inventory_batches WHERE id = $1`, [b]))[0].quantity_available;
  console.log('Batches for a return');
  let r = await call('GET', `/stock/batches?vendor_id=${V.a}&limit=10`, { token: t.packer });
  check("batches filter by supplier, with a total", r.status === 200 && r.json.data.total === 1 && r.json.data.batches[0].id === B.a && r.json.data.batches[0].vendor_id === V.a, r.json.data);
  await q(`UPDATE inventory_batches SET is_recalled = TRUE WHERE id = $1`, [B.b]);
  r = await call('GET', '/stock/batches?recalled=true&q=S9-', { token: t.packer });
  check('recalled batches with stock listed for return', r.json.data?.batches?.some((b) => b.id === B.b), r.json.data);

  console.log('Raise and approve');
  const raise = (body, token = t.packer) => call('POST', '/purchasing/returns', { token, body: { vendor_id: V.a, reason: 'damaged', notes: 'Crushed cartons on shelf', ...body } });
  r = await raise({ lines: [{ batch_id: B.b, quantity: 5 }] });
  check("a batch from another supplier cannot go back to this one", r.status === 422 && /another supplier/.test(r.json.message), r.json);
  r = await raise({ lines: [{ batch_id: B.a, quantity: 501 }] });
  check('cannot return more than the free stock', r.status === 422 && /free to return/.test(r.json.message), r.json);
  r = await raise({ lines: [{ batch_id: B.a, quantity: 1 }, { batch_id: B.a, quantity: 2 }] });
  check('each batch once per return', r.status === 422, r.status);
  const before = await stock(B.a);
  r = await raise({ lines: [{ batch_id: B.a, quantity: 10 }] });
  const ret = r.json.data;
  check('return raised in the PRN series (16 characters)', r.status === 201 && /^PRN\/\d{4}\/\d{5}$/.test(ret?.return_no || ''), r.json);
  check('valued at cost plus GST (₹500 + 12%)', Number(ret?.total_paise) === 56000, ret);
  r = await call('GET', `/purchasing/returns/${ret.id}`, { token: t.packer });
  check('intra-state supplier: CGST + SGST', Number(r.json.data?.cgst_paise) === 3000 && Number(r.json.data?.sgst_paise) === 3000 && Number(r.json.data?.igst_paise) === 0, r.json.data);
  check('stock untouched until approved', (await stock(B.a)) === before);
  r = await call('POST', `/purchasing/returns/${ret.id}/decide`, { token: t.packer, body: { approve: true, notes: 'ok by me' } });
  check('the store cannot approve', r.status === 403, r.status);
  r = await call('POST', `/purchasing/returns/${ret.id}/dispatch`, { token: t.packer, body: { dispatch_reference: 'LR-1' } });
  check('cannot dispatch before approval', r.status === 409, r.json);
  r = await call('POST', `/purchasing/returns/${ret.id}/decide`, { token: t.admin, body: { approve: true, notes: 'Checked the damaged stock' } });
  check('a second person approves', r.status === 200 && r.json.data.status === 'approved', r.json);
  check('stock leaves the batch on approval', (await stock(B.a)) === before - 10, { before, after: await stock(B.a) });
  const adj = (await q(`SELECT a.reason, a.status, a.quantity_delta FROM purchase_return_lines l JOIN stock_adjustments a ON a.id = l.adjustment_id WHERE l.return_id = $1`, [ret.id]))[0];
  check('recorded as an approved return-to-supplier adjustment', adj?.reason === 'return_to_supplier' && adj.status === 'approved' && adj.quantity_delta === -10, adj);

  const own = (await call('POST', '/purchasing/returns', { token: t.admin, body: { vendor_id: V.a, reason: 'excess', notes: 'Over-supplied', lines: [{ batch_id: B.a, quantity: 1 }] } })).json.data;
  r = await call('POST', `/purchasing/returns/${own.id}/decide`, { token: t.admin, body: { approve: true, notes: 'self' } });
  check('nobody approves their own return', r.status === 403, r.json);
  r = await call('POST', `/purchasing/returns/${own.id}/decide`, { token: t.admin2, body: { approve: false, notes: 'Keep it' } });
  check('rejected return moves no stock', r.json.data?.status === 'rejected' && (await stock(B.a)) === before - 10, r.json);

  console.log('Dispatch and settle');
  r = await call('POST', `/purchasing/returns/${ret.id}/settle`, { token: t.admin, body: { supplier_credit_note_no: 'SCN-1', supplier_credit_note_date: today, supplier_credit_paise: 56000 } });
  check('cannot settle before the goods leave', r.status === 409, r.json);
  r = await call('POST', `/purchasing/returns/${ret.id}/dispatch`, { token: t.packer, body: { dispatch_reference: 'EWB-181000123456' } });
  check('dispatched under its e-way bill / LR', r.json.data?.status === 'dispatched', r.json);
  r = await call('POST', `/purchasing/returns/${ret.id}/settle`, { token: t.admin, body: { supplier_credit_note_no: 'SCN-1', supplier_credit_note_date: '2020-01-01', supplier_credit_paise: 56000 } });
  check('credit note dated before dispatch refused', r.status === 400, r.json);
  r = await call('POST', `/purchasing/returns/${ret.id}/settle`, { token: t.admin, body: { supplier_credit_note_no: 'SCN-1', supplier_credit_note_date: today, supplier_credit_paise: 55000 } });
  check('settled by the supplier credit note; short credit shown', r.json.data?.status === 'settled' && r.json.data.difference_paise === -1000, r.json);

  r = await call('GET', `/accounts/reports/purchase-returns?from=${today}&to=${today}`, { token: t.admin });
  const row = r.json.data?.rows?.find((x) => x.return_no === ret.return_no);
  check('purchase-returns register for the CA', r.status === 200 && row && row.supplier_credit_note_no === 'SCN-1' && !r.json.data.rows.some((x) => x.return_no === own.return_no), r.json.data?.rows);
  r = await call('GET', '/purchasing/returns?status=settled', { token: t.packer });
  check('returns list by status with names', r.json.data?.returns?.some((x) => x.id === ret.id && x.requested_by_name === 'S9 Packer' && x.approved_by_name === 'S9 Admin'), r.json.data?.returns?.[0]);
}
