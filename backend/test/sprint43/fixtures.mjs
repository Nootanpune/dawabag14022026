// Sprint 43 fixtures: the Sprint 39 people, products and partner (sprint39/fixtures.mjs), plus
// the partner's verified pharmacist and stock of a second product. Made-up test data only;
// removed by cleanup().
import { q } from '../sprint5/lib.mjs';
import { PP, V, cleanup as cleanup39, ids, inDays, setup as setup39 } from '../sprint39/fixtures.mjs';

export async function cleanup() {
  const userIds = Object.values(ids);
  if (userIds.length) {
    await q(`DELETE FROM order_edits WHERE order_id IN (SELECT id FROM orders WHERE user_id = ANY($1))`, [userIds]);
    await q(`DELETE FROM health_profiles WHERE user_id = ANY($1)`, [userIds]);
    await q(`DELETE FROM patients WHERE owner_user_id = ANY($1)`, [userIds]);
  }
  // Earlier runs (ids not known yet): by the Sprint 39 mobiles
  await q(`DELETE FROM order_edits WHERE order_id IN (SELECT o.id FROM orders o JOIN users u ON u.id = o.user_id WHERE u.mobile LIKE '90000039%')`);
  await q(`DELETE FROM health_profiles WHERE user_id IN (SELECT id FROM users WHERE mobile LIKE '90000039%')`);
  await q(`DELETE FROM patients WHERE owner_user_id IN (SELECT id FROM users WHERE mobile LIKE '90000039%')`);
  await cleanup39();
}

export async function setup() {
  await setup39();
  await q(`UPDATE vendor_pharmacists SET state_council = 'Maharashtra State Pharmacy Council', valid_till = $2, registration_status = 'active',
             verified_at = NOW() WHERE id = $1`, [V.pharmacist, inDays(365)]);
  await q(`INSERT INTO partner_inventory (partner_id, partner_product_id, batch_number, qty_available, expiry_date)
           VALUES ($1, $2, 'S43-PB2', 300, CURRENT_DATE + 400)`, [V.a, PP.feed]);
}
