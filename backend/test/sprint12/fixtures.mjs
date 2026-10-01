// Sprint 12 test data: mobiles 90000012xx, policies titled 'S12 %'
import { login, q, signUp } from '../sprint5/lib.mjs';

const consent = { accept_privacy_notice: true, age_confirmed: true };
export const person = (mobile, name, extra = {}) => ({ customer_type: 'customer', full_name: name, mobile, password: 'Passw0rd!', ...consent, ...extra });
export const people = { admin: person('9000001201', 'S12 Admin'), buyer: person('9000001202', 'S12 Buyer') };
export const MARATHI_BUYER = person('9000001203', 'S12 Marathi Buyer', { notice_language: 'mr' });

export async function cleanup() {
  const ids = (await q(`SELECT id FROM users WHERE mobile = ANY($1)`, [[...Object.values(people), MARATHI_BUYER].map((p) => p.mobile)])).map((r) => r.id);
  const run = (sql, p) => q(sql, p);
  await run(`DELETE FROM policy_documents WHERE title LIKE 'S12 %'`);
  await run(`DELETE FROM job_runs WHERE job_name = 's12_old_job'`).catch(() => {});
  await run(`DELETE FROM payment_webhook_events WHERE event_id LIKE 'evt_s12_%'`);
  await run('UPDATE audit_logs SET performed_by = NULL WHERE performed_by = ANY($1)', [ids]);
  await run('UPDATE job_runs SET triggered_by = NULL WHERE triggered_by = ANY($1)', [ids]);
  for (const t of ['notification_deliveries', 'user_devices', 'cart_items', 'carts', 'notifications', 'consent_records', 'audit_logs', 'user_profiles']) {
    await run(`DELETE FROM ${t} WHERE user_id = ANY($1)`, [ids]);
  }
  await run('DELETE FROM users WHERE id = ANY($1)', [ids]);
}

export async function setup() {
  const ids = {};
  for (const [k, p] of Object.entries(people)) ids[k] = (await signUp(p)).user_id;
  await q(`UPDATE users SET role = 'super_admin' WHERE id = $1`, [ids.admin]);
  const t = {};
  for (const [k, p] of Object.entries(people)) t[k] = await login(p);
  return { ids, t };
}
export { login, signUp };
