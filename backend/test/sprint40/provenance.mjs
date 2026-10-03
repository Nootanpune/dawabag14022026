// Sprint 40 — the partner's "Batch suppliers" page: supplier details of its batches,
// added where none is recorded yet, then read-only (Sprint 39 provenance; C-02, C-34).
import { call, check } from '../sprint5/lib.mjs';
import { B, t } from './fixtures.mjs';

export async function runBatchSuppliers() {
  console.log('\nJ. Partner portal: batch suppliers (C-02, C-34)');
  let r = await call('GET', '/partner/batch-provenance?missing=1', { token: t.partner });
  check('the partner lists its batches with no supplier details', r.status === 200 && r.json.data.batches.some((b) => b.partner_inventory_id === B.partnerCold), r.json);
  const body = { supplier_name: 'S40 Distributors', supplier_licence_no: 'mh-s40-dist-21', supplier_invoice_no: 'S40-PUR-77', supplier_invoice_date: '01/09/2026' };
  r = await call('POST', `/partner/batch-provenance/${B.partnerCold}`, { token: t.partnerB, body });
  check('another partner cannot add details to it', r.status === 404, r.json);
  r = await call('POST', `/partner/batch-provenance/${B.partnerCold}`, { token: t.partner, body: { supplier_invoice_date: '31/12/2099' } });
  check('a future invoice date is refused', r.status === 400, r.json);
  r = await call('POST', `/partner/batch-provenance/${B.partnerCold}`, { token: t.partner, body });
  check('the partner adds the missing supplier details', r.status === 201 && r.json.data.supplier_licence_no === 'MH-S40-DIST-21'
    && r.json.data.supplier_invoice_date === '2026-09-01', r.json);
  r = await call('POST', `/partner/batch-provenance/${B.partnerCold}`, { token: t.partner, body: { ...body, supplier_name: 'Someone else' } });
  check('… then they are read-only (409)', r.status === 409 && r.json.code === 'PROVENANCE_ALREADY_RECORDED', r.json);
  r = await call('GET', '/partner/batch-provenance', { token: t.partner });
  check('… and listed with the batch', r.json.data?.batches?.some((b) => b.partner_inventory_id === B.partnerCold && b.supplier_name === 'S40 Distributors'), r.json.data);
}
