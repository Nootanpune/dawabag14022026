// Checkout disclosure, doctor declaration, policies, product declarations and copy
// review, side-effect reports, licence register, addresses, signed invoice links
import { call, check, q } from './lib.mjs';
import { PIN } from './fixtures.mjs';

export async function runCompliance({ t, P, addr, ids }) {
  console.log('Checkout preview (C-35) and doctor declaration (C-15)');
  const invBefore = (await q(`SELECT COALESCE(MAX(last_number), 0) AS n FROM invoice_series WHERE series_key = 'DWB'`))[0].n;
  const resBefore = (await q(`SELECT quantity_reserved FROM inventory_batches WHERE product_id = $1`, [P.own]))[0].quantity_reserved;
  let r = await call('POST', '/orders/preview', { token: t.buyer, body: { address_id: addr.buyer, pincode: PIN,
    items: [{ product_id: P.own, quantity: 1 }, { product_id: P.part, quantity: 1 }] } });
  const pv = r.json.data;
  const own = pv?.shipments?.find((s) => s.seller_type === 'dawabag');
  const part = pv?.shipments?.find((s) => s.seller_type === 'partner');
  check('preview shows one block per seller with licence and delivery estimate', r.status === 200 && own && part
    && part.seller_name === 'S5 Partner' && part.seller_licence === 'DL-S5-20B' && /2 days/.test(part.delivery_estimate)
    && /12 hours/.test(own.delivery_estimate), pv);
  check('preview lines carry country of origin and batch expiry', own?.lines?.[0]?.country_of_origin === 'India' && /^\d{4}-\d{2}$/.test(own?.lines?.[0]?.batch_expiry || ''), own?.lines);
  check('preview charge break-up adds up', pv?.charges && pv.charges.items_paise + pv.charges.gst_paise + pv.charges.delivery_paise
    - pv.charges.discount_paise - pv.charges.wallet_paise === pv.charges.total_payable_paise, pv?.charges);
  const invAfter = (await q(`SELECT COALESCE(MAX(last_number), 0) AS n FROM invoice_series WHERE series_key = 'DWB'`))[0].n;
  const resAfter = (await q(`SELECT quantity_reserved FROM inventory_batches WHERE product_id = $1`, [P.own]))[0].quantity_reserved;
  const orders = (await q(`SELECT COUNT(*)::int AS n FROM orders WHERE user_id = $1`, [ids.buyer]))[0].n;
  check('preview reserves nothing, uses no invoice number, creates no order', invAfter === invBefore && resAfter === resBefore && orders === 0,
    { invBefore, invAfter, resBefore, resAfter, orders });
  r = await call('POST', '/orders', { token: t.doctor, body: { address_id: addr.doctor, pincode: PIN, items: [{ product_id: P.own, quantity: 1 }] } });
  check('doctor order without the practitioner declaration refused', r.status === 400, r.json);
  r = await call('POST', '/orders', { token: t.doctor, body: { address_id: addr.doctor, pincode: PIN, practitioner_declaration: true, items: [{ product_id: P.own, quantity: 1 }] } });
  const decl = r.json.data?.order ? (await q(`SELECT practitioner_declared_at FROM orders WHERE id = $1`, [r.json.data.order.id]))[0] : null;
  check('doctor order with the declaration recorded', r.status === 201 && decl?.practitioner_declared_at, r.json);

  console.log('Policies (C-39)');
  r = await call('GET', '/legal/policies/refund');
  check('unpublished policy is a 404', r.status === 404, r.json);
  const body = 'Medicines cannot be returned once delivered, except damaged, wrong, missing, expired, near-expiry or recalled items, which are refunded in full.';
  const today = new Date().toISOString().slice(0, 10);
  r = await call('POST', '/legal/policies', { token: t.buyer, body: { doc_key: 'refund', title: 'S5 Refund policy', body, effective_from: today, lawyer_reviewed: false } });
  check('buyer cannot publish policies', r.status === 403, r.json);
  r = await call('POST', '/legal/policies', { token: t.admin, body: { doc_key: 'refund', title: 'S5 Refund policy', body, effective_from: today, lawyer_reviewed: false } });
  const v1 = r.json.data?.version;
  r = await call('POST', '/legal/policies', { token: t.admin, body: { doc_key: 'refund', title: 'S5 Refund policy v2', body: body + ' Refunds within 7 days.', effective_from: today, lawyer_reviewed: true } });
  check('a new version never overwrites the old', r.status === 201 && r.json.data.version === v1 + 1, r.json);
  r = await call('GET', '/legal/policies/refund');
  check('public page shows the latest version', r.json.data?.title === 'S5 Refund policy v2', r.json);
  r = await call('GET', `/legal/policies/refund?version=${v1}`);
  check('earlier version still readable', r.json.data?.title === 'S5 Refund policy', r.json);
  r = await call('POST', '/orders/preview', { token: t.buyer, body: { address_id: addr.buyer, pincode: PIN, items: [{ product_id: P.own, quantity: 1 }] } });
  check('checkout preview links the refund policy', r.json.data?.policies?.some((p) => p.doc_key === 'refund'), r.json.data?.policies);

  console.log('Product declarations (C-17) and copy review (C-19)');
  r = await call('POST', '/products', { token: t.admin, body: { name: 'S5 No decl', sku: 'S5-NODECL', category: 'Smoke', drug_schedule: 'OTC',
    gst_rate: 12, mrp_paise: 10000, offer_price_paise: 9000 } });
  check('product without net quantity and manufacturer refused', r.status === 422, r.json);
  r = await call('GET', `/products/${P.copy}`);
  const pd = r.json.data;
  check('product page shows declarations and supplied batch expiry', pd?.net_quantity === '10 tablets' && pd?.manufacturer_name === 'S5 Pharma Ltd'
    && pd?.country_of_origin === 'India' && /^\d{4}-\d{2}$/.test(pd?.supplied_batch_expiry || ''), pd);
  check('public product page hides trade prices', pd && !('ptr_price_paise' in pd) && !('pts_price_paise' in pd) && pd.price_paise === 9000, pd);
  check('unreviewed copy is hidden', pd?.description === null && pd?.content_reviewed === false, pd);
  r = await call('GET', `/products/${P.copy}`, { token: t.trader });
  check('a retailer sees their own trade price', r.json.data?.price_paise === 7500, r.json.data?.price_paise);
  r = await call('PATCH', `/products/${P.copy}`, { token: t.admin, body: { description: 'This tablet cures diabetes in weeks.' } });
  const flagged = (await q(`SELECT content_status, content_flags FROM products WHERE id = $1`, [P.copy]))[0];
  check('restricted claim is flagged for the pharmacist', flagged.content_status === 'pending_review' && flagged.content_flags?.[0]?.condition === 'diabetes', flagged);
  r = await call('GET', '/products/content-review/queue', { token: t.pharmacist });
  check('pharmacist review queue lists it', r.json.data?.products?.some((p) => p.id === P.copy), r.json);
  r = await call('POST', `/products/${P.copy}/content-review`, { token: t.pharmacist, body: { approve: true, notes: 'fine' } });
  check('flagged copy needs a written justification to approve', r.status === 400, r.json);
  r = await call('POST', `/products/${P.copy}/content-review`, { token: t.pharmacist, body: { approve: false, notes: 'Forbidden cure claim' } });
  check('pharmacist rejects the claim', r.json.data?.content_status === 'rejected', r.json);
  await call('PATCH', `/products/${P.copy}`, { token: t.admin, body: { description: 'Relieves headache and mild fever.' } });
  r = await call('POST', `/products/${P.copy}/content-review`, { token: t.pharmacist, body: { approve: true, notes: 'Plain indication' } });
  r = await call('GET', `/products/${P.copy}`);
  check('approved copy is shown', r.json.data?.description === 'Relieves headache and mild fever.', r.json.data?.description);

  console.log('Side-effect reports (C-29)');
  r = await call('POST', '/compliance/adverse-events', { token: t.buyer, body: { product_id: P.own, patient_initials: 'SB', patient_age_years: 34,
    reaction: 'Skin rash and itching two hours after the first dose', seriousness: 'hospitalised', outcome: 'recovering' } });
  const adr = r.json.data;
  check('buyer reports a serious reaction', r.status === 201 && /^ADR-\d{4}-\d{6}$/.test(adr?.report_no || ''), r.json);
  r = await call('GET', '/compliance/adverse-events/admin/all?status=new', { token: t.pharmacist });
  const listed = r.json.data?.reports?.find((x) => x.id === adr.id);
  const dueDays = listed ? Math.round((new Date(listed.forward_due_at) - new Date(listed.created_at)) / 864e5) : null;
  check('pharmacist sees it with a 15-day PvPI deadline', dueDays === 15, listed);
  r = await call('PATCH', `/compliance/adverse-events/${adr.id}`, { token: t.pharmacist, body: { status: 'forwarded', notes: 'Sent to AMC' } });
  check('forwarding needs the PvPI reference', r.status === 400, r.json);
  r = await call('PATCH', `/compliance/adverse-events/${adr.id}`, { token: t.pharmacist, body: { status: 'forwarded', notes: 'Sent to AMC Nashik', pvpi_reference: 'PVPI-2026-00123' } });
  check('report forwarded to PvPI', r.status === 200, r.json);
  r = await call('GET', `/compliance/adverse-events/${adr.id}`, { token: t.trader });
  check("another buyer cannot read the report", r.status === 404, r.json);

  console.log('Licence register (C-07)');
  const soon = new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10);
  r = await call('POST', '/compliance/licences', { token: t.admin, body: { licence_type: 'retail_20', licence_number: 'S5-MH-NSK-20-001',
    issued_by: 'FDA Maharashtra', premises: 'Nashik store', valid_from: '2021-10-01', valid_upto: soon, renewal_owner: 'Store manager' } });
  check('licence added', r.status === 201, r.json);
  r = await call('POST', '/admin/jobs/licence_register_alerts/run', { token: t.admin });
  const j1 = r.json.data?.summary;
  r = await call('POST', '/admin/jobs/licence_register_alerts/run', { token: t.admin });
  const j2 = r.json.data?.summary;
  check('expiry alert sent once at the 30-day threshold, not repeated', j1?.alerted >= 1 && j2?.alerted === 0, { j1, j2 });
  r = await call('GET', '/compliance/licences', { token: t.admin });
  check('register shows the licence as expiring', r.json.data?.licences?.find((l) => l.licence_number === 'S5-MH-NSK-20-001')?.validity === 'expiring', r.json);
  r = await call('GET', '/compliance/licences', { token: t.pharmacist });
  check('only admins manage the register', r.status === 403, r.json);

  console.log('Addresses');
  const a = { label: 'Work', full_name: 'S5 Buyer', mobile: '9876543210', address_line1: '12 MG Road', city: 'Nashik', state: 'Maharashtra', pincode: PIN };
  r = await call('POST', '/users/me/addresses', { token: t.buyer, body: { ...a, pincode: '4220' } });
  check('invalid PIN code refused', r.status === 422, r.json);
  r = await call('POST', '/users/me/addresses', { token: t.buyer, body: a });
  const work = r.json.data;
  check('address added', r.status === 201, r.json);
  // The doctor's address is on their order from the preview section
  r = await call('PUT', `/users/me/addresses/${addr.doctor}`, { token: t.doctor, body: { ...a, full_name: 'S5 Doctor', label: 'Clinic', address_line1: '5 New Lane' } });
  check('editing an address used on an order creates a new one', r.status === 200 && r.json.data.id !== addr.doctor, r.json);
  const old = (await q(`SELECT deleted_at, address_line1 FROM addresses WHERE id = $1`, [addr.doctor]))[0];
  check('the original stays unchanged for the invoice', old.address_line1 === '5 Test Lane' && old.deleted_at, old);
  r = await call('POST', `/users/me/addresses/${work.id}/default`, { token: t.buyer });
  r = await call('GET', '/users/me/addresses', { token: t.buyer });
  check('default switched; serviceability shown', r.json.data?.[0]?.id === work.id && r.json.data?.[0]?.is_serviceable === true, r.json.data);
  r = await call('DELETE', `/users/me/addresses/${work.id}`, { token: t.trader });
  check("cannot delete someone else's address", r.status === 404, r.json);

  console.log('Signed invoice links and privacy requests');
  const ship = (await q(`SELECT s.id FROM order_shipments s JOIN orders o ON o.id = s.order_id WHERE o.user_id = $1 LIMIT 1`, [ids.doctor]))[0].id;
  r = await call('GET', `/invoices/shipments/${ship}/link`, { token: t.doctor });
  const url = r.json.data?.url;
  check('buyer gets a 5-minute signed invoice link', /\?exp=\d+&sig=[0-9a-f]{64}$/.test(url || ''), r.json);
  r = await call('GET', url, { raw: true, absolute: true });
  check('signed link opens the PDF without a login', r.status === 200 && r.buf.subarray(0, 4).toString() === '%PDF', r.status);
  r = await call('GET', url.replace(/sig=(.)/, (_, c) => `sig=${c === '0' ? '1' : '0'}`), { raw: true, absolute: true });
  check('tampered link refused', r.status === 404, r.status);
  r = await call('GET', `/invoices/shipments/${ship}/link`, { token: t.trader });
  check("no link for someone else's invoice", r.status === 404, r.json);
  await call('POST', '/privacy/requests', { token: t.buyer, body: { request_type: 'correction', details: 'Fix my name' } });
  r = await call('GET', '/privacy/requests', { token: t.buyer });
  check('buyer sees their privacy requests', r.json.data?.requests?.[0]?.request_type === 'correction', r.json);
}
