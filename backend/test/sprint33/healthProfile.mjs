// Sprint 33 — health profile: explicit consent first (C-41), the pharmacist sees the buyer's (or the
// family member's) allergies and conditions on the order they check (C-08, audited C-46), and
// deleting it removes the data and records the withdrawal (C-43, C-44).
import { call, check, q } from '../sprint5/lib.mjs';
import { P, PIN, ids, t } from './fixtures.mjs';

export async function runHealthProfile() {
  console.log('\nHealth profile: consent first');
  let r = await call('GET', '/health-profile', { token: t.buyer });
  check('empty; consent not given; the purpose is stated', r.status === 200 && r.json.data?.consent?.given === false
    && /pharmacists/.test(r.json.data.consent.purpose) && r.json.data.allergies.length === 0, r.json.data);
  r = await call('PUT', '/health-profile', { token: t.buyer, body: { allergies: ['Penicillin'] } });
  check('saving without ticking consent is refused', r.status === 400 && /Tick the consent box/.test(r.json.message), r.json);
  r = await call('POST', '/health-profile/members', { token: t.buyer, body: { full_name: 'S33 Asha', relationship: 'mother', age_years: 64 } });
  check('… family members too', r.status === 400, r.json);
  const stored = await q('SELECT 1 FROM health_profiles WHERE user_id = $1', [ids.buyer]);
  check('nothing stored', stored.length === 0, stored);
  r = await call('PUT', '/health-profile', { token: t.buyer, body: { consent: true, allergies: [' Penicillin ', 'penicillin', 'Sulpha drugs'],
    conditions: ['Asthma'], current_medicines: ['Salbutamol inhaler'] } });
  check('with consent: saved, list cleaned', r.status === 200 && r.json.data?.consent.given === true
    && JSON.stringify(r.json.data.allergies) === '["Penicillin","Sulpha drugs"]', r.json.data);
  const consent = await q(`SELECT granted, policy_version FROM consent_records WHERE user_id = $1 AND purpose = 'health_profile'`, [ids.buyer]);
  check('consent recorded with its version (C-41)', consent.length === 1 && consent[0].granted && consent[0].policy_version === 'health-profile-v1', consent);
  const audit = await q(`SELECT new_value::text AS v FROM audit_logs WHERE user_id = $1 AND action = 'health_profile_saved'`, [ids.buyer]);
  check('the save is audited without the health details themselves', audit.length === 1 && !/Penicillin|Asthma/.test(audit[0].v), audit);
  r = await call('PUT', '/health-profile', { token: t.buyer, body: { allergies: ['Penicillin'], conditions: ['Asthma'], current_medicines: [] } });
  check('later saves need no new tick', r.status === 200 && r.json.data?.allergies.length === 1, r.json);
  r = await call('POST', '/health-profile/members', { token: t.buyer, body: { full_name: 'S33 Asha', relationship: 'mother', age_years: 64,
    allergies: ['Aspirin'], conditions: ['Diabetes'] } });
  const asha = (r.json.data?.family_members ?? []).find((m) => m.full_name === 'S33 Asha');
  check('family member added with age, allergies and conditions', r.status === 201 && asha?.age === 64 && asha.allergies[0] === 'Aspirin', r.json.data);
  r = await call('POST', '/health-profile/members', { token: t.buyer, body: { full_name: 'S33 Ravi', relationship: 'son', age_years: 130 } });
  check('an impossible age is refused', r.status === 422 || r.status === 400, r.json);
  r = await call('POST', '/health-profile/members', { token: t.buyer, body: { full_name: 'S33 Ravi', relationship: 'son', age_years: 9 } });
  const ravi = (r.json.data?.family_members ?? []).find((m) => m.full_name === 'S33 Ravi');
  r = await call('PUT', `/health-profile/members/${ravi?.id}`, { token: t.other, body: { full_name: 'S33 Ravi', relationship: 'son', age_years: 10 } });
  check('another buyer cannot change a family member', r.status === 404 || r.status === 400, r.status);

  console.log('\nThe pharmacist sees it on the order they check');
  const own = await call('POST', '/orders', { token: t.buyer, body: { address_id: t.address, pincode: PIN, items: [{ product_id: P.dear, quantity: 1 }] } });
  const forMum = await call('POST', '/orders', { token: t.buyer, body: { address_id: t.address, pincode: PIN, patient_id: asha?.id,
    items: [{ product_id: P.dear, quantity: 1 }] } });
  const ownId = own.json.data?.order?.id;
  const mumId = forMum.json.data?.order?.id;
  check('two orders placed (one for the mother)', !!ownId && !!mumId, [own.json, forMum.json]);
  r = await call('GET', `/health-profile/orders/${ownId}`, { token: t.buyer });
  check('buyers cannot use the pharmacist view', r.status === 403, r.status);
  r = await call('GET', `/health-profile/orders/${ownId}`, { token: t.admin });
  check('… nor an admin', r.status === 403, r.status);
  r = await call('GET', `/health-profile/orders/${ownId}`, { token: t.pharmacist });
  check('pharmacist: the buyer’s allergies and conditions', r.status === 200 && r.json.data?.shared === true && r.json.data.for === 'buyer'
    && r.json.data.allergies[0] === 'Penicillin' && r.json.data.conditions[0] === 'Asthma', r.json.data);
  r = await call('GET', `/health-profile/orders/${mumId}`, { token: t.packer });
  check('order for a family member: hers, with name, relation and age', r.status === 200 && r.json.data?.for === 'family_member'
    && r.json.data.full_name === 'S33 Asha' && r.json.data.age === 64 && r.json.data.allergies[0] === 'Aspirin', r.json.data);
  const looks = await q(`SELECT performed_by FROM audit_logs WHERE user_id = $1 AND action = 'health_profile_viewed'`, [ids.buyer]);
  check('each look is audited (C-46)', looks.length === 2 && looks.some((l) => l.performed_by === ids.pharmacist), looks);

  console.log('\nDelete (withdraw consent)');
  r = await call('GET', '/privacy/export', { token: t.buyer });
  check('included in “Download my data”', r.json.health_profile?.allergies?.[0] === 'Penicillin' && r.json.family_members?.length === 2, r.json.health_profile);
  r = await call('DELETE', '/health-profile', { token: t.buyer });
  check('deleted: nothing left, consent off', r.status === 200 && r.json.data?.consent.given === false && r.json.data.allergies.length === 0
    && r.json.data.family_members.length === 0, r.json.data);
  const left = await q(`SELECT full_name, deleted_at IS NOT NULL AS hidden, allergies::text AS a, age_years FROM patients WHERE owner_user_id = $1`, [ids.buyer]);
  check('the mother named on an order is kept for that record but hidden and wiped; the son is gone', left.length === 1
    && left[0].full_name === 'S33 Asha' && left[0].hidden && left[0].a === '[]' && left[0].age_years === null, left);
  const withdrawn = await q(`SELECT granted FROM consent_records WHERE user_id = $1 AND purpose = 'health_profile' ORDER BY recorded_at DESC LIMIT 1`, [ids.buyer]);
  check('the withdrawal is a new consent record (C-41)', withdrawn[0]?.granted === false, withdrawn);
  r = await call('GET', `/health-profile/orders/${ownId}`, { token: t.pharmacist });
  check('the pharmacist now sees nothing', r.json.data?.shared === false && !r.json.data.allergies, r.json.data);
}
