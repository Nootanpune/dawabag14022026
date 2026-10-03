// Sprint 41 fixtures: the Sprint 39 people, products and partner (sprint39/fixtures.mjs), plus
// what this suite adds on top of them (GDP records, chain heads, OTP counters, a setting).
import { q, redis } from '../sprint5/lib.mjs';
import { cleanup as cleanup39, people, setup as setup39 } from '../sprint39/fixtures.mjs';

export const UNKNOWN_MOBILE = '9000004199';

export async function cleanup() {
  const userIds = (await q('SELECT id FROM users WHERE mobile = ANY($1)', [Object.values(people).map((p) => p.mobile)])).map((r) => r.id);
  const productIds = (await q(`SELECT id FROM products WHERE sku LIKE 'S39-%'`)).map((r) => r.id);
  await q(`UPDATE app_settings SET value = 'null', updated_by = NULL WHERE key = 'delivery.cold_chain_couriers'`);
  await q('DELETE FROM gdp_records WHERE product_id = ANY($1)', [productIds]);
  await q('UPDATE chain_heads SET recorded_by = NULL WHERE recorded_by = ANY($1)', [userIds]);
  await q('UPDATE stock_adjustments SET requested_by = NULL WHERE requested_by = ANY($1)', [userIds]).catch(() => {});
  await cleanup39();
  for (const m of [...Object.values(people).map((p) => p.mobile), UNKNOWN_MOBILE]) {
    await redis.del(`otp:${m}`, `otp_wrong:${m}`, `otp_gap:${m}`, `otp_sends:${m}`);
  }
  await redis.del('chain_verify:running');
}

export const setup = setup39;
