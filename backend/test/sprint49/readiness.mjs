// Sprint 49 — Admin → Launch readiness: computed items against known fixtures (counts move by
// exactly what the fixtures add), manual items editable by admins only and audited, no secret
// value anywhere in the answer.
import { call, check, q } from '../sprint5/lib.mjs';
import { apiLogin, ids, MANUAL_KEY, people, saved, setup, setupAdmin, t } from './fixtures.mjs';

const get = async (token) => call('GET', '/admin/launch-readiness', { token });
const itemOf = (data, key) => data.sections.flatMap((s) => s.items).find((i) => i.key === key);

/** Every env value that is a secret (or a key id / password): none may appear in the answer. */
const SECRET_ENV = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'MSG91_AUTH_KEY', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET',
  'DB_PASSWORD', 'DB_APP_PASSWORD', 'HEALTH_ENC_KEY', 'TOTP_ENC_KEY', 'SHIPROCKET_PASSWORD', 'SHIPROCKET_WEBHOOK_TOKEN', 'AGORA_APP_CERTIFICATE',
  'IRP_PASSWORD', 'IRP_CLIENT_SECRET', 'AWS_SECRET_ACCESS_KEY', 'FCM_SERVICE_ACCOUNT_JSON'];

export async function runReadiness() {
  // The counts are global on a shared development database: read them before and after the fixtures
  await setupAdmin();
  const first = await get(t.admin);
  const before = first.json.data?.facts;
  await setup();
  const delta = {};
  const after = await get(t.admin);
  check('admin opens Launch readiness (200)', after.status === 200, after.json);
  const d = after.json.data;
  const f = d.facts, b = before;
  const moved = (path, by) => {
    const pick = (o) => path.split('.').reduce((x, k) => x?.[k], o);
    delta[path] = pick(f) - pick(b);
    check(`facts.${path} moved by ${by}`, delta[path] === by, { before: pick(b), after: pick(f) });
  };
  moved('pharmacists.dawabag', 2);
  moved('pharmacists.dawabag_recorded', 1);
  moved('pharmacists.dawabag_verified', 1);
  moved('pharmacists.partner', 2);
  moved('pharmacists.partner_verified', 1);
  moved('two_factor.logins', 4);
  moved('two_factor.enrolled', 1);
  moved('practitioners.total', 1);
  moved('practitioners.pending', 1);
  moved('products.live', 2);
  moved('products.online_permitted_live', 1);
  moved('products.online_restricted_live', 1);
  moved('products.online_restricted_all', 2);
  moved('products.buyer_restricted', 1);
  moved('products.schedule_c_c1', 1);
  moved('products.drafts_open', 1);
  moved('products.drafts_with_suggestions', 1);
  moved('products.live_with_info', 1);
  moved('products.live_without_info', 1);
  moved('products.imported_info_open', 1);

  // Items follow the facts
  check('pharmacist registrations: not all verified → in progress', itemOf(d, 'pharmacist_registrations').status === 'in_progress', itemOf(d, 'pharmacist_registrations'));
  check('pharmacist evidence names both Dawabag and partners', /Dawabag pharmacists: \d+ .*recorded \d+, verified and in date \d+/.test(itemOf(d, 'pharmacist_registrations').evidence[0])
    && /Partners' pharmacists/.test(itemOf(d, 'pharmacist_registrations').evidence[1]), itemOf(d, 'pharmacist_registrations').evidence);
  check('doctor registrations: one waiting → in progress', itemOf(d, 'practitioner_registrations').status === 'in_progress');
  check('catalogue: an open draft → in progress', itemOf(d, 'catalogue').status === 'in_progress');
  check('online sale: a live product not allowed online yet → in progress', itemOf(d, 'online_sale').status === 'in_progress');
  check('medicine information: an imported draft open → in progress', itemOf(d, 'medicine_info').status === 'in_progress');
  if (f.two_factor.policy === 'optional') check('two-step sign-in: optional with logins enrolled → in progress', itemOf(d, 'two_factor').status === 'in_progress');
  check('two-step evidence shows the enrolment share', /\d+ of \d+ \(\d+%\)/.test(itemOf(d, 'two_factor').evidence.join(' ')), itemOf(d, 'two_factor').evidence);
  check('manual 5.3 shows the Schedule C / C1 count', itemOf(d, '5.3').evidence[0] === `Products marked Schedule C / C1: ${f.products.schedule_c_c1}`, itemOf(d, '5.3'));
  check('manual 1.6 shows the buyer-restriction count', itemOf(d, '1.6').evidence[0] === `Products with a buyer restriction set: ${f.products.buyer_restricted}`);
  if (process.env.DB_APP_LOGIN) {
    check('restricted DB login in use → done', itemOf(d, 'db_login').status === 'done' && f.db_login.user === process.env.DB_APP_LOGIN, itemOf(d, 'db_login'));
  }
  const appEnv = process.env.APP_ENV || 'development';
  check('APP_ENV reported', d.app_env === appEnv && f.app_env === appEnv);
  if (appEnv !== 'production') {
    check('production-only items are not applicable here', ['razorpay_keys', 'app_env'].every((k) => itemOf(d, k).status === 'not_applicable'));
    const id = process.env.RAZORPAY_KEY_ID || '';
    const mode = !id || !process.env.RAZORPAY_KEY_SECRET ? 'no keys' : id.startsWith('rzp_test_') ? 'test mode' : id.startsWith('rzp_live_') ? 'live mode' : 'mode not recognised';
    check(`Razorpay mode from the key prefix only (${mode})`, itemOf(d, 'razorpay_keys').evidence[0].endsWith(mode), itemOf(d, 'razorpay_keys').evidence);
  }
  check('encryption keys: presence only', f.secrets.health_enc_key === !!process.env.HEALTH_ENC_KEY?.trim() && f.secrets.totp_enc_key === !!process.env.TOTP_ENC_KEY?.trim());
  check('SMS: MSG91 key presence matches the server', f.secrets.msg91_auth_key === !!process.env.MSG91_AUTH_KEY);
  check('PUBLIC_WEB_URL reported as set / not set', (f.public_web_url === null) === !process.env.PUBLIC_WEB_URL?.trim());

  // Policies and the emergency stop match the database
  const pub = await q(`SELECT DISTINCT ON (doc_key) doc_key FROM policy_documents WHERE language = 'en' AND effective_from <= CURRENT_DATE ORDER BY doc_key, version DESC`);
  check('policies published = the database', f.policies.filter((p) => p.published).length === pub.length && f.policies.length === 5, { f: f.policies, pub });
  const pause = (await q(`SELECT value FROM app_settings WHERE key = 'sales.rx_pause'`))[0]?.value;
  check('emergency stop state = the setting', f.emergency_stop.paused === (pause?.paused === true)
    && itemOf(d, 'emergency_stop').status === (pause?.paused === true ? 'in_progress' : 'done'));
  const heads = (await q(`SELECT COUNT(*)::int AS n FROM (SELECT DISTINCT chain FROM chain_heads) c`))[0].n;
  check('chain check counts the recorded chains', f.chain.chains === heads, { f: f.chain, heads });

  // Summary: "X of Y ready" without the not-applicable items
  const all = d.sections.flatMap((s) => s.items);
  check('summary counts every item once', d.summary.total + d.summary.not_applicable === all.length
    && d.summary.ready === all.filter((i) => i.status === 'done').length, d.summary);
  check('eight sections, manual and computed items', d.sections.length === 8 && all.some((i) => i.kind === 'manual') && all.some((i) => i.kind === 'computed'));
  check('items link to the screen where they are done', itemOf(d, 'pharmacist_registrations').link?.href === '/admin/pharmacist-registrations'
    && itemOf(d, 'two_factor').link?.href === '/admin/two-factor');

  // Webhook events, backups and the cold-chain list as they change
  await q(`INSERT INTO payment_webhook_events (event_id, event, outcome, received_at) VALUES ('evt_S49_1', 'payment.captured', 'S49 smoke fixture', NOW())`);
  await q(`INSERT INTO job_runs (job_name, started_at, finished_at, status, summary) VALUES ('db_backup', NOW() - INTERVAL '3 minutes', NOW() - INTERVAL '1 minute', 'succeeded', '{"key": "s49/daily/demo.dump"}')`);
  saved.couriers = (await q(`SELECT value FROM app_settings WHERE key = 'delivery.cold_chain_couriers'`))[0]?.value ?? null;
  const put = await call('PUT', '/admin/settings/delivery.cold_chain_couriers', { token: t.superAdmin, body: { value: 'S49 Demo Cold Courier, S49 Other Courier' } });
  check('super-admin sets the cold-chain courier list', put.status === 200, put.json);
  const d2 = (await get(t.admin)).json.data;
  check('a webhook event just received counts as recent', d2.facts.webhooks.last_30_days === f.webhooks.last_30_days + 1
    && Date.now() - Date.parse(d2.facts.webhooks.last_received_at) < 120_000, d2.facts.webhooks);
  if (process.env.RAZORPAY_WEBHOOK_SECRET) check('webhook item done with a secret and a recent event', itemOf(d2, 'razorpay_webhook').status === 'done');
  check('a backup a minute ago → backups done', itemOf(d2, 'backups').status === 'done' && !!d2.facts.backup.last_ok_at, itemOf(d2, 'backups'));
  check('cold-chain couriers listed → done (2 names)', itemOf(d2, 'cold_chain_couriers').status === 'done' && d2.facts.cold_chain_couriers === 2, itemOf(d2, 'cold_chain_couriers'));
  const otherBackups = (await q(`SELECT COUNT(*)::int AS n FROM job_runs WHERE job_name = 'db_backup' AND NOT (summary->>'key' LIKE 's49/%')`))[0].n;
  if (!otherBackups) {
    await q(`UPDATE job_runs SET started_at = NOW() - INTERVAL '31 hours', finished_at = NOW() - INTERVAL '30 hours' WHERE job_name = 'db_backup' AND summary->>'key' LIKE 's49/%'`);
    const d3 = (await get(t.admin)).json.data;
    check('the newest backup 30 hours old → backups in progress', itemOf(d3, 'backups').status === 'in_progress' && /30 h ago/.test(itemOf(d3, 'backups').evidence[0]), itemOf(d3, 'backups'));
  }

  // No secret value anywhere in the answer (presence only)
  const text = JSON.stringify(after.json) + JSON.stringify(d2);
  const leaked = SECRET_ENV.filter((k) => String(process.env[k] ?? '').trim().length >= 6 && text.includes(String(process.env[k]).trim()));
  check('no secret value in the answer', leaked.length === 0, leaked);
  check('secrets reported as flags only', Object.entries(f.secrets).every(([k, v]) => typeof v === 'boolean' || (k === 'razorpay_mode' && [null, 'live', 'test', 'unknown'].includes(v))
    || (k === 'provider_overrides' && Array.isArray(v) && v.every((x) => /^[A-Z0-9_]+$/.test(x)))), f.secrets);

  // Who may open it
  for (const [who, token, want] of [['pharmacist', t.pharmacist, 403], ['consumer', t.consumer, 403], ['nobody', undefined, 401]]) {
    const r = await get(token);
    check(`${who} cannot open Launch readiness (${want})`, r.status === want, r.status);
  }
  check('super-admin opens it too', (await get(t.superAdmin)).status === 200);

  await runManual();
}

async function runManual() {
  saved.manual = (await q('SELECT status, note, updated_by, updated_at FROM launch_checklist_items WHERE item_key = $1', [MANUAL_KEY]))[0];
  check('manual items are seeded from the checklist', !!saved.manual
    && (await q(`SELECT COUNT(*)::int AS n FROM launch_checklist_items`))[0].n >= 20);
  const path = `/admin/launch-readiness/manual/${MANUAL_KEY}`;
  const note = 'S49 smoke: lawyer meeting booked (demo note)';
  const newStatus = saved.manual.status === 'in_progress' ? 'done' : 'in_progress';
  const r = await call('PUT', path, { token: t.admin, body: { status: newStatus, note } });
  check('admin updates a manual item', r.status === 200 && r.json.data?.status === newStatus && r.json.data?.note === note
    && r.json.data?.updated_by_name === people.admin.full_name, r.json);
  const shown = itemOf((await get(t.admin)).json.data, MANUAL_KEY);
  check('the page shows the new status, note and who changed it', shown.status === newStatus && shown.note === note && shown.kind === 'manual'
    && shown.updated_by_name === people.admin.full_name && !!shown.updated_at, shown);
  const audit = await q(`SELECT old_value, new_value, performed_by FROM audit_logs WHERE action = 'launch_checklist_item_updated' AND performed_by = $1`, [ids.admin]);
  check('the change is audited with old and new values', audit.length === 1 && audit[0].old_value.status === saved.manual.status
    && audit[0].new_value.status === newStatus && audit[0].new_value.note === note && audit[0].new_value.item_key === MANUAL_KEY, audit);
  const again = await call('PUT', path, { token: t.admin, body: { status: newStatus, note } });
  const audit2 = await q(`SELECT 1 FROM audit_logs WHERE action = 'launch_checklist_item_updated' AND performed_by = $1`, [ids.admin]);
  check('the same values again change nothing and add no audit entry', again.status === 200 && audit2.length === 1);
  const sup = await call('PUT', path, { token: t.superAdmin, body: { status: 'not_applicable' } });
  check('super-admin may update too (note cleared)', sup.status === 200 && sup.json.data.status === 'not_applicable' && sup.json.data.note === null
    && sup.json.data.status_label === 'Not needed', sup.json);
  for (const [who, token, want] of [['pharmacist', t.pharmacist, 403], ['consumer', t.consumer, 403], ['nobody', undefined, 401]]) {
    const x = await call('PUT', path, { token, body: { status: 'done' } });
    check(`${who} cannot change a manual item (${want})`, x.status === want, x.status);
  }
  const bad = await call('PUT', path, { token: t.admin, body: { status: 'finished' } });
  check('an unknown status is refused (422)', bad.status === 422, bad.json);
  const long = await call('PUT', path, { token: t.admin, body: { status: 'done', note: 'x'.repeat(1001) } });
  check('a note over 1000 characters is refused (422)', long.status === 422, long.status);
  const missing = await call('PUT', '/admin/launch-readiness/manual/9.9', { token: t.admin, body: { status: 'done' } });
  check('an unknown item → 404', missing.status === 404, missing.json);
  const computed = await call('PUT', '/admin/launch-readiness/manual/backups', { token: t.admin, body: { status: 'done' } });
  check('a computed item cannot be set by hand (404)', computed.status === 404, computed.status);

  const c = await apiLogin();
  if (c) {
    try {
      const del = await c.query(`DELETE FROM launch_checklist_items WHERE item_key = $1`, [MANUAL_KEY]).then(() => null, (e) => e.code);
      check('the API login cannot delete a checklist item (23514)', del === '23514', del);
      const title = await c.query(`UPDATE launch_checklist_items SET title = 'changed' WHERE item_key = $1`, [MANUAL_KEY]).then(() => null, (e) => e.code);
      check('the API login cannot change an item\'s title (23514)', title === '23514', title);
      const anon = await c.query(`UPDATE launch_checklist_items SET status = 'done', updated_by = NULL WHERE item_key = $1`, [MANUAL_KEY]).then(() => null, (e) => e.code);
      check('a change must name who made it (23514)', anon === '23514', anon);
    } finally { await c.end(); }
  }
}
