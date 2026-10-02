// Sprint 35 — every order is checked and released by a registered pharmacist before
// packing (C-08). Suites written before that, whose subject is something else (seals,
// couriers, e-invoices, returns…), release their shipments with these helpers first.

/** Through the API, as a pharmacist_rx login with a registration number (the real path). */
export async function releaseForPacking(call, token, shipmentId) {
  const r = await call('POST', `/fulfilment/shipments/${shipmentId}/check`, { token, body: { decision: 'release' } });
  if (r.status !== 200) throw new Error(`pharmacist release of ${shipmentId} failed: ${r.status} ${JSON.stringify(r.json)}`);
  return r;
}

/**
 * Straight in the test database, for suites with no pharmacist login (e.g. a partner's
 * shipment in a suite about settlement). Records a named test pharmacist, as the
 * schema requires for any release.
 */
export async function releaseInDb(q, shipmentId) {
  const rows = await q(
    `UPDATE order_shipments SET pharmacist_check = 'released', pharmacist_checked_at = NOW(),
       pharmacist_name = 'Test Pharmacist', pharmacist_reg_no = 'TEST-REG-1'
     WHERE id = $1 AND pharmacist_check IN ('pending', 'held') RETURNING id`, [shipmentId]);
  return rows.length;
}
