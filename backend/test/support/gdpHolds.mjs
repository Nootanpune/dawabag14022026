// Sprint 40 — a cold-chain pack read outside 2–8 °C at dispatch is still refused, and is now
// also logged as an excursion that puts the batch on GDP hold until a pharmacist decides
// (C-25). Earlier suites that test the refusal and then dispatch at a good temperature
// stand in for that pharmacist's decision with this helper (the real API path).
//   call: the suite's call(); q: (sql, params) => rows; token: a pharmacist_rx login
export async function releaseShipmentGdpHolds(call, q, token, shipmentId) {
  const open = await q(
    `SELECT r.id FROM gdp_records r WHERE r.shipment_id = $1 AND r.event_kind = 'excursion'
       AND NOT EXISTS (SELECT 1 FROM gdp_records d WHERE d.excursion_id = r.id AND d.disposition IN ('release', 'destroy'))`, [shipmentId]);
  for (const e of open) {
    const r = await call('POST', `/gdp/excursions/${e.id}/disposition`, { token, body: { disposition: 'release',
      justification: 'Smoke test fixture: the reading was the pack, not the stored batch; batch stayed at 2–8 °C' } });
    if (r.status !== 200) throw new Error(`GDP release for ${shipmentId} failed: ${r.status} ${JSON.stringify(r.json)}`);
  }
  return open.length;
}
