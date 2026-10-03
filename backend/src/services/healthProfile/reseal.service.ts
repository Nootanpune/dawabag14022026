// Seals health details still held in plain columns (rows written before Sprint 43) and
// re-seals values sealed with an older key (key rotation, RUNBOOK §6 "Health data key").
// Run by the API at start-up; safe to run again (only rows still to do are touched).
import { query, withTransaction } from '../../config/database';
import { logger } from '../../config/logger';
import { writeAuditTx } from '../../utils/audit';
import { healthAad, healthKeys, memberHealth, profileHealth, sealHealth, sealMember } from './sealing';

const BATCH = 200;

export async function sealHealthAtRest(): Promise<{ profiles: number; members: number; unreadable: number }> {
  const current = healthKeys().current.id;
  const notCurrent = `NOT LIKE 'h1.${current}.%'`;
  let profiles = 0, members = 0, unreadable = 0;
  for (;;) {
    const rows = await query<any>(
      `SELECT user_id, sealed, allergies, conditions, current_medicines FROM health_profiles
       WHERE (sealed IS NULL AND (allergies <> '[]' OR conditions <> '[]' OR current_medicines <> '[]'))
          OR (sealed IS NOT NULL AND sealed ${notCurrent})
       ORDER BY user_id LIMIT ${BATCH}`);
    let done = 0;
    for (const r of rows) {
      let h;
      try { h = profileHealth(r); } catch { unreadable++; continue; }
      await query(
        `UPDATE health_profiles SET sealed = $2, allergies = '[]', conditions = '[]', current_medicines = '[]' WHERE user_id = $1`,
        [r.user_id, sealHealth(healthAad('health_profiles', r.user_id), h)]);
      profiles++; done++;
    }
    if (rows.length < BATCH || done === 0) break;
  }
  for (;;) {
    const rows = await query<any>(
      `SELECT id, health_sealed, allergies, conditions FROM patients
       WHERE (health_sealed IS NULL AND (allergies <> '[]' OR conditions <> '[]'))
          OR (health_sealed IS NOT NULL AND health_sealed ${notCurrent})
       ORDER BY id LIMIT ${BATCH}`);
    let done = 0;
    for (const r of rows) {
      let h;
      try { h = memberHealth(r); } catch { unreadable++; continue; }
      await query(`UPDATE patients SET health_sealed = $2, allergies = '[]', conditions = '[]' WHERE id = $1`, [r.id, sealMember(r.id, h)]);
      members++; done++;
    }
    if (rows.length < BATCH || done === 0) break;
  }
  if (profiles || members) {
    await withTransaction((c) => writeAuditTx(c, { userId: null, action: 'health_data_sealed', newValue: { profiles, members, key_id: current } }));
    logger.info(`Health details sealed at rest: ${profiles} profile(s), ${members} family member(s) (key ${current})`);
  }
  if (unreadable) logger.error(`Health details: ${unreadable} row(s) sealed with a key this server does not have (HEALTH_ENC_KEY_PREVIOUS?)`);
  return { profiles, members, unreadable };
}
