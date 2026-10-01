// GST e-invoicing (C-31) against the fake IRP, and 16-character document numbers (CGST Rule 46)
import { call, check, db, q } from '../sprint5/lib.mjs';
import { calls } from '../fakes/server.mjs';
import { expireIrpTokens, irp } from '../fakes/irp.mjs';
import { order, PREMISES_PIN, SELLER_GSTIN, waitFor } from './fixtures.mjs';

const einv = (shipmentId, type = 'INV') => q(`SELECT * FROM einvoices WHERE shipment_id = $1 AND doc_type = $2`, [shipmentId, type]);
const generated = (shipmentId, type = 'INV') => waitFor(`SELECT * FROM einvoices WHERE shipment_id = $1 AND doc_type = $2`, [shipmentId, type],
  (r) => r[0] && r[0].status !== 'pending');
const pack = (ctx, id) => call('POST', `/fulfilment/shipments/${id}/pack`, { token: ctx.t.packer });
const dispatch = (ctx, id, n) => call('POST', `/fulfilment/shipments/${id}/dispatch`, { token: ctx.t.packer,
  body: { courier_partner: 'Delhivery', awb_number: `S9AWB${n}${Date.now() % 100000}`, seal_number: `SEAL-S9-${n}` } });
const pdf = (ctx, id) => call('GET', `/invoices/shipments/${id}.pdf`, { token: ctx.t.admin, raw: true });

export async function runEinvoice(ctx) {
  const { t } = ctx;
  console.log('Document numbers (CGST Rule 46: 16 characters)');
  const before = await order(ctx);
  check('invoice number fits 16 characters', /^DWB\/\d{4}\/\d{5}$/.test(before.invoiceNumber) && before.invoiceNumber.length <= 16, before.invoiceNumber);
  await q(`INSERT INTO vendors (name, drug_license_no, gst_number, pincode, city, state, vendor_type, approval_status, is_active)
           VALUES ('S9 Partner Pending', 'DL-S9P', '27AAACP3333C1Z5', '422007', 'Nashik', 'Maharashtra', 'marketplace_partner', 'pending', TRUE)`);
  const pv = (await q(`SELECT id FROM vendors WHERE name = 'S9 Partner Pending'`))[0].id;
  let r = await call('POST', `/vendors/${pv}/approve`, { token: t.admin, body: { drug_license_type: 'dl20', drug_license_expiry: '2028-12-31', vendor_type: 'marketplace_partner', invoice_prefix: 'LONGPX' } });
  check('a partner prefix too long for 16-character numbers is refused', r.status === 400 && /2–4/.test(r.json.message), r.json);

  console.log('Off until switched on');
  r = await pack(ctx, before.shipmentId);
  check('with e-invoicing off, packing a B2B order needs no IRN', r.status === 200 && r.json.data.einvoice_required === false && !(await einv(before.shipmentId)).length, r.json);

  await call('PUT', '/admin/settings/legal.entity', { token: t.admin, body: { value: { name: 'Dawabag Private Limited', address: 'Plot 9, MIDC Ambad, Nashik', gstin: SELLER_GSTIN, cin: '' } } });
  await call('PUT', '/admin/settings/dawabag.premises', { token: t.admin, body: { value: { pincode: PREMISES_PIN, latitude: 20.01, longitude: 73.79 } } });
  r = await call('PUT', '/admin/settings/einvoice.enabled', { token: t.admin, body: { value: true } });
  check('admin switches e-invoicing on', r.status === 200, r.json);

  r = await dispatch(ctx, before.shipmentId, 0);
  check('a B2B parcel packed before switch-on cannot leave without its IRN', r.status === 409 && /IRN/.test(r.json.message), r.json);
  let e = await generated(before.shipmentId);
  check('…its e-invoice is registered in the background', e[0]?.status === 'generated', e[0]);
  r = await dispatch(ctx, before.shipmentId, 0);
  check('…and then it dispatches', r.status === 200, r.json);

  console.log('B2B invoice registered at packing (C-31)');
  const a = await order(ctx);
  r = await pack(ctx, a.shipmentId);
  check('packing says an IRN is needed', r.status === 200 && r.json.data.einvoice_required === true, r.json);
  e = await generated(a.shipmentId);
  check('IRN, acknowledgement and signed QR stored', e[0]?.status === 'generated' && e[0].irn?.length === 64 && e[0].ack_no && e[0].signed_qr, e[0]);
  const p = irp.payloads.find((x) => x.DocDtls.No === a.invoiceNumber);
  check('IRP got the invoice number, B2B, seller GSTIN and HSN', p && p.TranDtls.SupTyp === 'B2B' && p.DocDtls.Typ === 'INV'
    && p.SellerDtls.Gstin === SELLER_GSTIN && p.SellerDtls.Pin === Number(PREMISES_PIN) && p.ItemList[0].HsnCd === '30042019', p);
  check('Karnataka buyer: place of supply 29, IGST only', p?.BuyerDtls.Pos === '29' && p.ValDtls.IgstVal > 0 && p.ValDtls.CgstVal === 0, p?.ValDtls);
  const sh = (await q(`SELECT total_paise FROM order_shipments WHERE id = $1`, [a.shipmentId]))[0];
  check('e-invoice value equals the tax invoice total', Math.round(p?.ValDtls.TotInvVal * 100) === sh.total_paise, { irp: p?.ValDtls.TotInvVal, invoice: sh.total_paise });
  r = await pdf(ctx, a.shipmentId);
  check('invoice PDF carries the IRP QR code', r.status === 200 && r.buf.includes('/Subtype /Image'), r.status);
  r = await dispatch(ctx, a.shipmentId, 1);
  check('registered B2B parcel dispatches', r.status === 200, r.json);

  console.log('Consumers and failures');
  const c = await order(ctx, 'buyer', 1);
  r = await pack(ctx, c.shipmentId);
  check('consumer (no GSTIN) invoice needs no IRN', r.json.data?.einvoice_required === false && !(await einv(c.shipmentId)).length, r.json);
  r = await pdf(ctx, c.shipmentId);
  check('…and its PDF has no QR', r.status === 200 && !r.buf.includes('/Subtype /Image'), r.status);

  irp.down = true;
  const d = await order(ctx);
  await pack(ctx, d.shipmentId);
  e = await waitFor(`SELECT * FROM einvoices WHERE shipment_id = $1`, [d.shipmentId], (x) => x[0]?.attempts > 0);
  check('IRP down: stays pending with the reason, for retry', e[0]?.status === 'pending' && /not responding/.test(e[0].error_message || ''), e[0]);
  r = await dispatch(ctx, d.shipmentId, 2);
  check('…and the parcel waits', r.status === 409 && /being registered/.test(r.json.message), r.json);
  irp.down = false;
  r = await call('POST', `/einvoices/${e[0].id}/retry`, { token: t.admin });
  check('admin retries once the IRP is back', r.status === 200 && r.json.data.status === 'generated', r.json);

  const bad = await order(ctx, 'trader2');
  await pack(ctx, bad.shipmentId);
  e = await generated(bad.shipmentId);
  check('IRP rejection (bad GSTIN) recorded as failed with its code', e[0]?.status === 'failed' && e[0].error_code === '3028', e[0]);
  r = await dispatch(ctx, bad.shipmentId, 3);
  check('dispatch names the failure', r.status === 409 && /GSTIN is invalid/.test(r.json.message), r.json);
  r = await call('GET', '/einvoices?status=failed', { token: t.admin });
  check('admin exception list shows it', r.status === 200 && r.json.data.einvoices.some((x) => x.id === e[0].id) && r.json.data.enabled === true, r.json.data?.counts);
  r = await call('GET', '/einvoices', { token: t.packer });
  check('packers cannot open the e-invoice admin list', r.status === 403, r.status);
  await q(`UPDATE orders SET buyer_gstin = '29AABCS8888K1Z5' WHERE id = $1`, [bad.order.id]);   // corrected by accounts
  r = await call('POST', `/einvoices/${e[0].id}/retry`, { token: t.admin });
  check('after the correction the retry registers it', r.json.data?.status === 'generated', r.json);

  console.log('Sessions, duplicates and finality');
  const logins = calls('/eivital/v1.04/auth').length;
  expireIrpTokens();
  const f = await order(ctx);
  await pack(ctx, f.shipmentId);
  e = await generated(f.shipmentId);
  check('expired IRP token: logs in again and carries on', e[0]?.status === 'generated' && calls('/eivital/v1.04/auth').length === logins + 1, { status: e[0]?.status });
  const irnF = e[0].irn;
  await q(`DELETE FROM einvoices WHERE id = $1`, [e[0].id]);   // lost locally (maintenance session)
  r = await dispatch(ctx, f.shipmentId, 4);
  e = await generated(f.shipmentId);
  check('already registered at the IRP: the existing IRN is fetched, not duplicated', r.status === 409 && e[0]?.irn === irnF, { r: r.json, e: e[0]?.irn });
  let blocked = null;
  try {
    await db.query('BEGIN'); await db.query("SET LOCAL dawabag.maintenance = 'off'");
    await db.query(`UPDATE einvoices SET irn = 'x' WHERE id = $1`, [e[0].id]);
  } catch (err) { blocked = err.message; } finally { await db.query('ROLLBACK'); }
  check('a registered IRN cannot be changed', /final/.test(blocked || ''), blocked);

  console.log('Credit note against an e-invoiced invoice');
  r = await call('PATCH', `/orders/${f.order.id}/status`, { token: t.admin, body: { status: 'cancelled', reason: 'Buyer cancelled by phone' } });
  const cn = (await q(`SELECT id, credit_note_number FROM credit_notes WHERE order_id = $1`, [f.order.id]))[0];
  check('cancellation issues a credit note numbered within 16 characters', r.status === 200 && /^DWBC\/\d{4}\/\d{5}$/.test(cn?.credit_note_number || ''), { r: r.json, cn });
  e = await generated(f.shipmentId, 'CRN');
  const pc = irp.payloads.find((x) => x.DocDtls.Typ === 'CRN' && x.DocDtls.No === cn?.credit_note_number);
  check('credit note registered with the IRP against the original invoice', e[0]?.status === 'generated'
    && pc?.RefDtls?.PrecDocDtls?.[0]?.InvNo === f.invoiceNumber, { e: e[0]?.status, ref: pc?.RefDtls });
}
