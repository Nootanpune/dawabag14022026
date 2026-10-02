// Sprint 34 C — dose reminder answers, ended reminders and (only when set) health profiles of
// long-inactive accounts are purged by the retention job; export / erasure cover them (C-43, C-44)
import { call, check, q } from '../sprint5/lib.mjs';
import { ids, t } from './fixtures.mjs';

export async function runRetention() {
  console.log('\nC. Retention of "My medicines" and health profiles');
  const current = (await q(`SELECT value FROM app_settings WHERE key = 'retention.days'`))[0]?.value ?? {};
  check('the migration added the reminder periods (2 years) without changing set values',
    current.reminder_dose_logs === 730 && current.ended_reminders === 730 && current.inactive_health_profiles === undefined, current);

  const reminder = async (opts) => (await q(
    `INSERT INTO medicine_reminders (user_id, medicine_name, times, start_date, end_date, is_active, updated_at)
     VALUES ($1, $2, ARRAY['08:00'], CURRENT_DATE - 900, $3, $4, $5) RETURNING id`,
    [ids.buyer, opts.name, opts.end ?? null, opts.active ?? true, opts.updated ?? new Date()]))[0].id;
  const live = await reminder({ name: 'S34 Live reminder' });
  const ended = await reminder({ name: 'S34 Ended reminder', end: new Date(Date.now() - 800 * 864e5) });
  const off = await reminder({ name: 'S34 Switched-off reminder', active: false, updated: new Date(Date.now() - 800 * 864e5) });
  const recentOff = await reminder({ name: 'S34 Recently off', active: false });
  const dose = async (r, daysAgo) => (await q(
    `INSERT INTO reminder_dose_logs (reminder_id, user_id, scheduled_for, status) VALUES ($1, $2, NOW() - make_interval(days => $3), 'taken') RETURNING id`,
    [r, ids.buyer, daysAgo]))[0].id;
  const oldAnswer = await dose(live, 800);
  const newAnswer = await dose(live, 3);

  // An idle buyer's health profile (not signed in or updated for 400 days) and an active one
  await q(`INSERT INTO health_profiles (user_id, allergies, consent_version, consented_at, updated_at)
           VALUES ($1, '["S34 idle allergy"]', 'test', NOW() - INTERVAL '400 days', NOW() - INTERVAL '400 days')`, [ids.idle]);
  await q(`UPDATE users SET last_login_at = NOW() - INTERVAL '400 days', created_at = NOW() - INTERVAL '500 days' WHERE id = $1`, [ids.idle]);
  const member = (await q(`INSERT INTO patients (owner_user_id, full_name, relationship, age_years, allergies, conditions)
     VALUES ($1, 'S34 Idle Mother', 'mother', 70, '["S34 member allergy"]', '["S34 condition"]') RETURNING id`, [ids.idle]))[0].id;

  const run = async (days) => {
    let r = await call('PUT', '/admin/settings/retention.days', { token: t.admin, body: { value: days } });
    check(`retention periods saved (${Object.keys(days).length} keys)`, r.status === 200, r.json);
    r = await call('POST', '/admin/jobs/retention_purge/run', { token: t.admin });
    return r;
  };
  try {
    let r = await call('PUT', '/admin/settings/retention.days', { token: t.admin, body: { value: { ...current, inactive_health_profiles: 100 } } });
    check('health profiles cannot be set to go after less than a year', r.status === 422, r.json);

    r = await run({ ...current });
    check('purge ran', r.status === 200, r.json);
    const answers = (await q('SELECT id FROM reminder_dose_logs WHERE id = ANY($1)', [[oldAnswer, newAnswer]])).map((x) => x.id);
    check('a Taken answer older than 2 years is deleted; last week\'s is kept', !answers.includes(oldAnswer) && answers.includes(newAnswer), answers);
    const left = (await q('SELECT id FROM medicine_reminders WHERE id = ANY($1)', [[live, ended, off, recentOff]])).map((x) => x.id);
    check('reminders that ended or were switched off over 2 years ago are deleted; live and recent ones kept',
      left.includes(live) && left.includes(recentOff) && !left.includes(ended) && !left.includes(off), left);
    let hp = await q('SELECT 1 FROM health_profiles WHERE user_id = $1', [ids.idle]);
    check('health profile kept while no period is set (until consent is withdrawn or erasure)', hp.length === 1);

    r = await run({ ...current, inactive_health_profiles: 365 });
    hp = await q('SELECT 1 FROM health_profiles WHERE user_id = $1', [ids.idle]);
    const m = (await q('SELECT allergies, conditions, age_years FROM patients WHERE id = $1', [member]))[0];
    check('with a period set: the idle account\'s health profile is deleted and the family member\'s health details wiped',
      r.status === 200 && hp.length === 0 && m?.allergies?.length === 0 && m?.conditions?.length === 0 && m?.age_years === null, { hp, m });
    const own = await q('SELECT 1 FROM health_profiles WHERE user_id = $1', [ids.buyer]);
    check('… an active buyer\'s profile is untouched', own.length === 1, own);
    const audit = await q(`SELECT new_value FROM audit_logs WHERE action = 'retention_purge' ORDER BY created_at DESC LIMIT 1`);
    check('the purge is audited with counts (C-46)', Number(audit[0]?.new_value?.deleted?.inactive_health_profiles) >= 1, audit[0]?.new_value);
  } finally {
    await q(`UPDATE app_settings SET value = $1 WHERE key = 'retention.days'`, [JSON.stringify(current)]);
  }

  console.log('\nC. Export and erasure include them (C-43)');
  const r = await call('GET', '/privacy/export', { token: t.buyer });
  const data = r.json ?? {};
  check('"Download my data" has the health profile and the reminders with their answers',
    r.status === 200 && !!data.health_profile && data.medicine_reminders?.some((x) => (x.answers ?? []).length >= 1), Object.keys(data));
}
