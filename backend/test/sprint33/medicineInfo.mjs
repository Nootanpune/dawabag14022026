// Sprint 33 — medicine information: draft → submit → pharmacist review (C-17, C-19) → live;
// buyers see only the approved version with empty sections hidden; every step audited (C-46).
import { call, check, q } from '../sprint5/lib.mjs';
import { P, ids, t } from './fixtures.mjs';

const invalid = (r) => r.status === 400 || r.status === 422;
const CONTENT = {
  overview: 'S33 Zorvex is a pain reliever and fever reducer.',
  uses: ['Fever', 'Mild to moderate pain', ''],
  how_to_use: 'Take it with water, after food.',
  side_effects: { common: ['Nausea'], serious: [], contact_doctor_if: ['You get a skin rash'] },
  safety: { alcohol: { level: 'unsafe', note: 'Avoid alcohol while taking it.' }, driving: { level: 'safe' } },
  missed_dose: 'Take it when you remember. Do not take two doses together.',
  quick_tips: ['Do not take more than 4 tablets in a day.'],
  facts: { therapeutic_class: 'Analgesic', habit_forming: false },
  faqs: [{ question: 'Can I take it on an empty stomach?', answer: 'It is better taken after food.' }],
};

export async function runMedicineInfo() {
  const id = P.current;
  console.log('\nMedicine information: nothing shown until a pharmacist approves it');
  let r = await call('GET', `/medicines/${id}/info`);
  check('no approved information yet → not available, disclaimer still sent', r.status === 200 && r.json.data?.available === false
    && r.json.data.disclaimer === 'For information only. Follow your doctor’s advice.', r.json);
  r = await call('GET', `/medicines/${id}/info/editor`);
  check('the editor needs sign-in', r.status === 401, r.status);
  r = await call('GET', `/medicines/${id}/info/editor`, { token: t.buyer });
  check('buyers cannot open the editor', r.status === 403, r.status);
  r = await call('PUT', `/medicines/${id}/info/draft`, { token: t.buyer, body: { content: CONTENT } });
  check('buyers cannot write it', r.status === 403, r.status);

  console.log('\nDraft, claims check and submit');
  r = await call('PUT', `/medicines/${id}/info/draft`, { token: t.admin, body: { content: { ...CONTENT, dosage_for_pets: 'x' } } });
  check('an unknown section is refused', invalid(r), r.json);
  r = await call('PUT', `/medicines/${id}/info/draft`, { token: t.admin,
    body: { content: { ...CONTENT, how_it_works: 'It cures arthritis for good.' } } });
  check('admin saves a draft (v1); the cure claim is flagged (C-19)', r.status === 200 && r.json.data?.version === 1
    && r.json.data.status === 'draft' && r.json.data.flags.some((f) => f.condition === 'arthritis'), r.json);
  check('… and it still needs a source before review', r.json.data?.problems?.some((p) => /source you used/.test(p)), r.json.data?.problems);
  r = await call('POST', `/medicines/${id}/info/submit`, { token: t.admin });
  check('submit without a source is refused in plain words', r.status === 400 && /source you used/.test(r.json.message), r.json);
  r = await call('PUT', `/medicines/${id}/info/draft`, { token: t.admin, body: { content: { ...CONTENT,
    how_it_works: 'It cures arthritis for good.', references: [{ source: 'Manufacturer’s package insert', date: 'March 2026' }] } } });
  check('saved again: still version 1, no problems left', r.status === 200 && r.json.data?.version === 1 && r.json.data.problems.length === 0, r.json);
  r = await call('POST', `/medicines/${id}/info/submit`, { token: t.admin });
  check('sent for review', r.status === 200 && r.json.data?.status === 'pending_review', r.json);
  r = await call('GET', `/medicines/${id}/info`);
  check('buyers still see nothing while it waits (C-19)', r.json.data?.available === false, r.json.data);
  r = await call('PUT', `/medicines/${id}/info/draft`, { token: t.pharmacist, body: { content: { ...CONTENT,
    how_it_works: 'It cures arthritis for good.', references: [{ source: 'Manufacturer’s package insert', date: 'March 2026' }] } } });
  check('editing while it waits sends it back to draft (must be submitted again)', r.status === 200 && r.json.data?.status === 'draft', r.json.data);
  r = await call('POST', `/medicines/${id}/info/review`, { token: t.pharmacist, body: { approve: true, notes: 'Checked.' } });
  check('a draft cannot be approved', r.status === 409, r.json);
  await call('POST', `/medicines/${id}/info/submit`, { token: t.pharmacist });
  r = await call('GET', '/medicines/info-review/queue', { token: t.pharmacist });
  check('it is in the pharmacist’s review queue with its flags', (r.json.data?.versions ?? []).some((v) => v.product_id === id
    && v.status === 'pending_review' && v.flags.length === 1), r.json.data);

  console.log('\nThe pharmacist’s review (C-19)');
  r = await call('POST', `/medicines/${id}/info/review`, { token: t.admin, body: { approve: true, notes: 'Looks fine to me.' } });
  check('an admin cannot approve it', r.status === 403, r.status);
  r = await call('POST', `/medicines/${id}/info/review`, { token: t.pharmacistNoReg, body: { approve: true, notes: 'Looks fine to me, checked.' } });
  check('a pharmacist without a council registration cannot approve', r.status === 403 && /registration number/.test(r.json.message), r.json);
  r = await call('POST', `/medicines/${id}/info/review`, { token: t.pharmacist, body: { approve: true, notes: 'OK by me.' } });
  check('flagged text needs a reason of 20+ characters to approve', r.status === 400 && /flagged claims/.test(r.json.message), r.json);
  r = await call('POST', `/medicines/${id}/info/review`, { token: t.pharmacist, body: { approve: false, notes: 'Remove the cure claim; not in the insert.' } });
  check('the pharmacist rejects v1', r.status === 200 && r.json.data?.status === 'rejected', r.json);
  r = await call('GET', `/medicines/${id}/info/editor`, { token: t.admin });
  check('the editor shows why, and starts from the rejected text', r.json.data?.last_rejected?.review_notes === 'Remove the cure claim; not in the insert.'
    && r.json.data.start_from.how_it_works === 'It cures arthritis for good.' && r.json.data.open === null, r.json.data);
  r = await call('PUT', `/medicines/${id}/info/draft`, { token: t.admin, body: { content: { ...CONTENT,
    references: [{ source: 'Manufacturer’s package insert', date: 'March 2026' }] } } });
  check('the fixed text is a new version (v2) with no flags', r.json.data?.version === 2 && r.json.data.flags.length === 0, r.json.data);
  await call('POST', `/medicines/${id}/info/submit`, { token: t.admin });
  r = await call('POST', `/medicines/${id}/info/review`, { token: t.pharmacist, body: { approve: true, notes: 'Matches the package insert.' } });
  check('approved', r.status === 200 && r.json.data?.status === 'approved' && r.json.data.version === 2, r.json);

  console.log('\nWhat buyers see');
  r = await call('GET', `/medicines/${id}/info`);
  const d = r.json.data ?? {};
  const keys = Object.keys(d.sections ?? {});
  check('the approved version is shown', d.available === true && d.version === 2 && d.sections.overview === CONTENT.overview, d);
  check('empty sections are hidden (no how it works, interactions)', !keys.includes('how_it_works') && !keys.includes('interactions')
    && keys.includes('references'), keys);
  check('blank list points are dropped; empty side-effect groups left out', JSON.stringify(d.sections?.uses) === '["Fever","Mild to moderate pain"]'
    && JSON.stringify(Object.keys(d.sections?.side_effects ?? {})) === '["common","contact_doctor_if"]', d.sections);
  check('safety advice only for the topics set, with plain labels', JSON.stringify(d.sections?.safety?.map((s) => [s.label, s.level_label])) === '[["Alcohol","Unsafe"],["Driving","Safe"]]', d.sections?.safety);
  check('fact box keeps "habit forming: no"', d.sections?.facts?.habit_forming === false && d.sections.facts.therapeutic_class === 'Analgesic', d.sections?.facts);
  check('“Reviewed by” comes from the review record (name, reg. no., date)', d.reviewed?.name === 'S33 Pharmacist'
    && d.reviewed.reg_no === 'S33-MSPC-0001' && !!d.reviewed.reviewed_at, d.reviewed);
  check('reference and disclaimer shown', d.sections?.references?.[0]?.source === 'Manufacturer’s package insert'
    && d.disclaimer === 'For information only. Follow your doctor’s advice.', d);

  console.log('\nChanging live text keeps the reviewed words until the new ones are approved');
  r = await call('PUT', `/medicines/${id}/info/draft`, { token: t.admin, body: { content: { ...CONTENT, overview: 'New words.',
    references: [{ source: 'Manufacturer’s package insert', date: 'April 2026' }] } } });
  check('a new draft (v3)', r.json.data?.version === 3, r.json.data);
  r = await call('GET', `/medicines/${id}/info`);
  check('buyers still see v2', r.json.data?.version === 2 && r.json.data.sections.overview === CONTENT.overview, r.json.data);
  await call('POST', `/medicines/${id}/info/submit`, { token: t.admin });
  await call('POST', `/medicines/${id}/info/review`, { token: t.pharmacist, body: { approve: true, notes: 'Updated insert checked.' } });
  r = await call('GET', `/medicines/${id}/info`);
  check('after approval v3 is live', r.json.data?.version === 3 && r.json.data.sections.overview === 'New words.', r.json.data);
  const rows = await q(`SELECT version, status, reviewer_reg_no FROM product_info_versions WHERE product_id = $1 ORDER BY version`, [id]);
  check('history kept: v1 rejected, v2 superseded, v3 approved', JSON.stringify(rows.map((x) => x.status)) === '["rejected","superseded","approved"]', rows);
  const audit = await q(`SELECT action, performed_by FROM audit_logs WHERE new_value->>'product_id' = $1 AND action LIKE 'product_info_%'`, [id]);
  const n = (a) => audit.filter((x) => x.action === a).length;
  check('every step audited (C-46)', n('product_info_draft_saved') >= 5 && n('product_info_submitted') === 4 && n('product_info_approved') === 2
    && n('product_info_rejected') === 1 && audit.some((x) => x.action === 'product_info_approved' && x.performed_by === ids.pharmacist), audit.map((x) => x.action));

  console.log('\nNot on sale → nothing shown');
  await q(`INSERT INTO product_info_versions (product_id, version, status, content, reviewed_by, reviewed_at, reviewer_name, reviewer_reg_no)
           VALUES ($1, 1, 'approved', '{"overview":"Hidden"}', $2, NOW(), 'S33 Pharmacist', 'S33-MSPC-0001')`, [P.inactive, ids.pharmacist]);
  r = await call('GET', `/medicines/${P.inactive}/info`);
  check('an inactive product’s approved text is not shown', r.json.data?.available === false, r.json.data);
}
