// Sprint 39 rules applied to the fixtures of the earlier smoke suites (test database only).
// The earlier suites test other things; these helpers stand in for the steps Sprint 39
// added before them, so those suites keep testing what they were written for:
//   • permitProducts — a pharmacist allowed the fixture products for online sale
//     (new products start 'restricted'; test/sprint39 tests that step itself)
//   • withPrescription — the buyer added a prescription when checkout asked for one
//     (POST /orders answers 422 PRESCRIPTION_REQUIRED without one)
//   • verifyPharmacists — an admin recorded and verified the fixture pharmacists'
//     registrations (unverified ones are blocked at every pharmacist gate)
import crypto from 'crypto';

const NEVER = `('Schedule X', 'NDPS')`;

/** Mark products (by id) as allowed for online sale, as a pharmacist would. Schedule X / NDPS stay as they are. */
export async function permitProducts(db, ids) {
  const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
  if (!list.length) return;
  await db.query(
    `UPDATE products SET online_sale_status = 'permitted', online_sale_ref = 'Smoke test fixture', online_sale_ref_date = CURRENT_DATE,
       online_sale_reason = 'Smoke test fixture', online_sale_set_at = NOW()
     WHERE id = ANY($1::uuid[]) AND drug_schedule NOT IN ${NEVER} AND online_sale_status <> 'permitted'`, [list]);
}

/** Same, by SKU pattern (LIKE). */
export async function permitProductsLike(db, skuLike) {
  await db.query(
    `UPDATE products SET online_sale_status = 'permitted', online_sale_ref = 'Smoke test fixture', online_sale_ref_date = CURRENT_DATE,
       online_sale_reason = 'Smoke test fixture', online_sale_set_at = NOW()
     WHERE sku LIKE $1 AND drug_schedule NOT IN ${NEVER} AND online_sale_status <> 'permitted' AND deleted_at IS NULL`, [skuLike]);
}

const userIdOf = (token) => {
  try { return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString()).sub; } catch { return null; }
};

/** A pending prescription the buyer uploaded (not attached to any order yet). */
export async function newPrescriptionFor(db, userId, patientId = null) {
  return (await db.query(
    `INSERT INTO prescriptions (user_id, patient_id, s3_key, original_filename, file_type)
     VALUES ($1, $2, $3, 'rx.jpg', 'jpg') RETURNING id`,
    [userId, patientId, `prescriptions/test/${crypto.randomUUID()}.jpg`])).rows[0].id;
}

/**
 * POST /orders the way a buyer does at checkout: if the server asks for a prescription
 * (422 PRESCRIPTION_REQUIRED), one is uploaded and the order is sent again with it.
 */
export async function withPrescription(db, send, body, token) {
  const r = await send(body);
  if (r.status === 422 && r.json?.code === 'PRESCRIPTION_REQUIRED' && !body?.prescription_id) {
    const uid = userIdOf(token);
    if (!uid) return r;
    const rxId = await newPrescriptionFor(db, uid, body?.patient_id ?? null);
    return send({ ...body, prescription_id: rxId });
  }
  return r;
}

/** Verified, in-date registrations for pharmacist_rx users that have a number but no record yet. */
export async function verifyPharmacists(db) {
  await db.query(
    `INSERT INTO pharmacist_registrations (user_id, state_council, registration_no, valid_till, status, status_note, verified_at)
     SELECT u.id, 'Test State Pharmacy Council', u.pharmacist_reg_no, CURRENT_DATE + 365, 'active', 'Smoke test fixture', NOW()
     FROM users u WHERE u.role = 'pharmacist_rx' AND u.pharmacist_reg_no IS NOT NULL AND u.deleted_at IS NULL
     ON CONFLICT (user_id) DO UPDATE SET registration_no = EXCLUDED.registration_no, state_council = EXCLUDED.state_council,
       valid_till = EXCLUDED.valid_till, status = 'active', verified_at = NOW()
     WHERE pharmacist_registrations.status_note = 'Smoke test fixture'
       AND pharmacist_registrations.registration_no IS DISTINCT FROM EXCLUDED.registration_no`);
}

/** Verified registrations for partner pharmacists added without council / validity. */
export async function verifyPartnerPharmacists(db) {
  await db.query(
    `UPDATE vendor_pharmacists SET state_council = 'Test State Pharmacy Council', valid_till = CURRENT_DATE + 365, verified_at = NOW(),
       status_note = 'Smoke test fixture'
     WHERE verified_at IS NULL AND NOT recorded_before_sprint39 AND registration_status = 'active'`);
}

/**
 * Before each request of an earlier suite: fixture products that no person has decided
 * on are allowed for online sale, and fixture pharmacists are verified. A product a test
 * explicitly restricted (online_sale_set_by set) is left alone.
 */
export async function applySprint39Defaults(db) {
  await db.query(
    `UPDATE products SET online_sale_status = 'permitted', online_sale_ref = 'Smoke test fixture', online_sale_ref_date = CURRENT_DATE,
       online_sale_reason = 'Smoke test fixture', online_sale_set_at = NOW()
     WHERE online_sale_status = 'restricted' AND online_sale_set_by IS NULL AND drug_schedule NOT IN ${NEVER}
       AND deleted_at IS NULL AND COALESCE(online_sale_reason, '') NOT LIKE 'Set when online-sale status was introduced%'`);
  await verifyPharmacists(db);
  await verifyPartnerPharmacists(db);
}
