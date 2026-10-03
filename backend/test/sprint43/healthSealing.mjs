// Sprint 43 B — health details sealed at rest (URS-006; DPDP sensitive data, C-41, C-44):
// the buyer's allergies / conditions / medicines and a family member's are kept only as a
// sealed value; the plain columns stay empty; rows from before are sealed at the API's
// start-up; a sealed value copied to another person does not open.
import { call, check, q } from '../sprint5/lib.mjs';
import { callAt, startApi } from '../sprint26/trialApi.mjs';
import { ids, placeOrder, t } from '../sprint39/fixtures.mjs';

const row = async (userId) => (await q(`SELECT sealed, allergies::text AS a, conditions::text AS c, current_medicines::text AS m FROM health_profiles WHERE user_id = $1`, [userId]))[0];

export async function runHealthSealing() {
  console.log('\nB. Health details sealed at rest');
  let r = await call('PUT', '/health-profile', { token: t.buyer, body: { consent: true, allergies: ['Penicillin'], conditions: ['Asthma'], current_medicines: ['Salbutamol inhaler'] } });
  check('saved and read back as usual', r.status === 200 && r.json.data?.allergies?.[0] === 'Penicillin' && r.json.data.current_medicines?.[0] === 'Salbutamol inhaler', r.json);
  let h = await row(ids.buyer);
  check('in the database: plain columns empty, one sealed value (h1.<key>.…)', h.a === '[]' && h.c === '[]' && h.m === '[]' && /^h1\.[0-9a-f]{8}\./.test(h.sealed ?? ''), h);
  check('… which does not contain the words', !/Penicillin|Asthma|Salbutamol/i.test(h.sealed));
  r = await call('POST', '/health-profile/members', { token: t.buyer, body: { full_name: 'S43 Asha', relationship: 'mother', age_years: 64, allergies: ['Aspirin'], conditions: ['Diabetes'] } });
  const m = (await q(`SELECT health_sealed, allergies::text AS a, conditions::text AS c, age_years FROM patients WHERE owner_user_id = $1 AND full_name = 'S43 Asha'`, [ids.buyer]))[0];
  check('family member: allergies / conditions sealed, plain empty; age kept', r.status === 201 && m?.a === '[]' && m.c === '[]'
    && /^h1\./.test(m.health_sealed ?? '') && !/Aspirin|Diabetes/.test(m.health_sealed) && m.age_years === 64
    && r.json.data.family_members.some((f) => f.full_name === 'S43 Asha' && f.allergies[0] === 'Aspirin'), { m, r: r.json });
  // The pharmacist's view on an order opens it (and is audited, Sprint 33)
  const { order } = await placeOrder([{ product_id: (await q(`SELECT id FROM products WHERE sku = 'S39-OTC'`))[0].id, quantity: 1 }], { withRx: false });
  r = await call('GET', `/health-profile/orders/${order.id}`, { token: t.pharmacist });
  check('the pharmacist checking an order sees the buyer\'s details (opened on demand)', r.status === 200 && r.json.data?.allergies?.[0] === 'Penicillin', r.json);
  r = await call('GET', '/privacy/export', { token: t.buyer });
  const exp = r.json?.data ?? r.json;
  check('"Download my data" opens them for the buyer', exp?.health_profile?.allergies?.[0] === 'Penicillin'
    && exp?.family_members?.some((f) => f.allergies?.[0] === 'Aspirin'), exp?.health_profile);

  // The database refuses plain values next to a sealed one
  let err = null;
  try { await q(`UPDATE health_profiles SET allergies = '["X"]' WHERE user_id = $1`, [ids.buyer]); } catch (e) { err = e.code; }
  check('database: plain details next to a sealed value are refused (check constraint)', err === '23514', err);

  // A sealed value copied to another person's row does not open
  await q(`INSERT INTO consent_records (user_id, purpose, granted, policy_version, notice_language) VALUES ($1, 'health_profile', TRUE, 'health-profile-v1', 'en')`, [ids.other]);
  await q(`INSERT INTO health_profiles (user_id, sealed, consent_version, consented_at) VALUES ($1, $2, 'health-profile-v1', NOW())`, [ids.other, h.sealed]);
  r = await call('GET', '/health-profile', { token: t.other });
  check('a sealed value copied to another account does not open (plain message, no details)', r.status === 500
    && r.json.code === 'HEALTH_DATA_UNREADABLE' && !/Penicillin/.test(JSON.stringify(r.json)), r.json);

  // Rows from before Sprint 43 (plain) are sealed when the API starts
  await q(`UPDATE health_profiles SET sealed = NULL, allergies = '["Sulpha drugs"]', conditions = '[]', current_medicines = '["Metformin"]' WHERE user_id = $1`, [ids.other]);
  const api = await startApi(4643, {});
  try {
    check('a second API started (start-up sealing runs)', !!api.base, api.log);
    h = await row(ids.other);
    check('the plain row was sealed at start-up and the plain columns emptied', /^h1\./.test(h.sealed ?? '') && h.a === '[]' && h.m === '[]', h);
    r = await callAt(api.base, 'GET', '/health-profile', { token: t.other });
    check('… and reads back the same', r.status === 200 && r.json.data?.allergies?.[0] === 'Sulpha drugs' && r.json.data.current_medicines?.[0] === 'Metformin', r.json);
    check('audit: health_data_sealed', (await q(`SELECT 1 FROM audit_logs WHERE action = 'health_data_sealed' AND created_at > NOW() - INTERVAL '5 minutes'`)).length >= 1);
  } finally { await api.stop?.(); }

  r = await call('DELETE', '/health-profile', { token: t.buyer });
  const gone = await q(`SELECT 1 FROM health_profiles WHERE user_id = $1`, [ids.buyer]);
  const asha = (await q(`SELECT health_sealed FROM patients WHERE owner_user_id = $1 AND full_name = 'S43 Asha'`, [ids.buyer]))[0];
  check('withdrawing consent deletes the sealed details too', r.status === 200 && gone.length === 0 && (!asha || asha.health_sealed === null), { gone, asha });
}
