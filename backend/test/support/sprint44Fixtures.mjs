// Sprint 44 rules applied to the fixtures of the earlier smoke suites (test database only).
// The earlier suites test other things; these helpers stand in for the steps Sprint 44 added:
//   • verifyPractitioners — Dawabag staff verified the fixture doctors' council registrations
//     (valid till, certificate copy checked); otherwise a doctor / hospital order is refused
//   • withWrittenOrder — the doctor signed a written order for the cart when checkout asked for
//     one (POST /orders answers 422 WRITTEN_ORDER_REQUIRED without it, Drugs Rules r.65(9)(b))
// test/sprint44 tests those steps themselves (state.sprint39Defaults = false).
import crypto from 'crypto';

const userIdOf = (token) => {
  try { return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString()).sub; } catch { return null; }
};

/** Verified, in-date registrations with a certificate copy for doctor / hospital fixtures not yet decided on. */
export async function verifyPractitioners(db) {
  await db.query(
    `UPDATE users SET nmc_status = 'verified', nmc_valid_till = CURRENT_DATE + 365, nmc_verified_at = NOW(),
       nmc_certificate_key = 'kyc/test/nmc_certificate/smoke-fixture.pdf', nmc_status_note = 'Smoke test fixture',
       nmc_reg_number = COALESCE(nmc_reg_number, 'TEST-MMC-1'), nmc_council_state = COALESCE(nmc_council_state, 'Test Medical Council'),
       practitioner_kind = COALESCE(practitioner_kind, 'doctor')
     WHERE customer_type = 'doc_hospital' AND nmc_valid_till IS NULL AND COALESCE(nmc_status, 'pending') NOT IN ('rejected', 'suspended')
       AND deleted_at IS NULL`);
}

/** A written order the doctor signed in the app for these lines (stand-in; the real signing is tested in sprint44). */
export async function writtenOrderFor(db, userId, items) {
  const names = new Map((await db.query(`SELECT id, name FROM products WHERE id = ANY($1::uuid[])`, [items.map((i) => i.product_id)]))
    .rows.map((r) => [r.id, r.name]));
  const list = items.map((i) => ({ product_id: i.product_id, product_name: names.get(i.product_id) ?? 'Product', quantity: i.quantity }));
  const text = `WRITTEN ORDER FOR DRUGS (smoke test fixture)\n${list.map((i) => `${i.product_name} — ${i.quantity}`).join('\n')}`;
  return (await db.query(
    `INSERT INTO written_orders (user_id, kind, items, declaration_text, typed_name, signature_method, content_sha256, practitioner)
     VALUES ($1, 'in_app', $2, $3, 'Smoke Fixture', 'password_reauth', $4,
             '{"kind":"doctor","name":"Smoke Fixture","registration_number":"TEST-MMC-1","council":"Test Medical Council","certificate_key":"kyc/test/nmc_certificate/smoke-fixture.pdf"}')
     RETURNING id`,
    [userId, JSON.stringify(list), text, crypto.createHash('sha256').update(text).digest('hex')])).rows[0].id;
}

/** POST /orders the way a doctor does at checkout: on 422 WRITTEN_ORDER_REQUIRED a written order is signed and the order sent again. */
export async function withWrittenOrder(db, send, body, token) {
  const r = await send(body);
  if (r.status === 422 && r.json?.code === 'WRITTEN_ORDER_REQUIRED' && !body?.written_order_id) {
    const uid = userIdOf(token);
    if (!uid) return r;
    const id = await writtenOrderFor(db, uid, body.items ?? []);
    return send({ ...body, written_order_id: id });
  }
  return r;
}
