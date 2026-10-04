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
  // Sprint 48 (security review 41–47 #8): pages by key (a page of rows this server cannot open no
  // longer stops the rows after it from being sealed), and each UPDATE applies only if the row is
  // still as it was read — the API may already be serving a buyer who saves new details.
  let after = '00000000-0000-0000-0000-000000000000';
  for (;;) {
    const rows = await query<any>(
      `SELECT user_id, sealed, allergies, conditions, current_medicines,
              ROW(sealed, allergies, conditions, current_medicines)::text AS snap
       FROM health_profiles
       WHERE user_id > $1
         AND ((sealed IS NULL AND (allergies <> '[]' OR conditions <> '[]' OR current_medicines <> '[]'))
           OR (sealed IS NOT NULL AND sealed ${notCurrent}))
       ORDER BY user_id LIMIT ${BATCH}`, [after]);
    for (const r of rows) {
      after = r.user_id;
      let h;
      try { h = profileHealth(r); } catch { unreadable++; continue; }
      const done = await query(
        `UPDATE health_profiles SET sealed = $2, allergies = '[]', conditions = '[]', current_medicines = '[]'
         WHERE user_id = $1 AND ROW(sealed, allergies, conditions, current_medicines)::text = $3 RETURNING user_id`,
        [r.user_id, sealHealth(healthAad('health_profiles', r.user_id), h), r.snap]);
      if (done.length) profiles++;
    }
    if (rows.length < BATCH) break;
  }
  after = '00000000-0000-0000-0000-000000000000';
  for (;;) {
    const rows = await query<any>(
      `SELECT id, health_sealed, allergies, conditions, ROW(health_sealed, allergies, conditions)::text AS snap
       FROM patients
       WHERE id > $1
         AND ((health_sealed IS NULL AND (allergies <> '[]' OR conditions <> '[]'))
           OR (health_sealed IS NOT NULL AND health_sealed ${notCurrent}))
       ORDER BY id LIMIT ${BATCH}`, [after]);
    for (const r of rows) {
      after = r.id;
      let h;
      try { h = memberHealth(r); } catch { unreadable++; continue; }
      const done = await query(
        `UPDATE patients SET health_sealed = $2, allergies = '[]', conditions = '[]'
         WHERE id = $1 AND ROW(health_sealed, allergies, conditions)::text = $3 RETURNING id`, [r.id, sealMember(r.id, h), r.snap]);
      if (done.length) members++;
    }
    if (rows.length < BATCH) break;
  }
  if (profiles || members) {
    await withTransaction((c) => writeAuditTx(c, { userId: null, action: 'health_data_sealed', newValue: { profiles, members, key_id: current } }));
    logger.info(`Health details sealed at rest: ${profiles} profile(s), ${members} family member(s) (key ${current})`);
  }
  if (unreadable) logger.error(`Health details: ${unreadable} row(s) sealed with a key this server does not have (HEALTH_ENC_KEY_PREVIOUS?)`);
  return { profiles, members, unreadable };
}
