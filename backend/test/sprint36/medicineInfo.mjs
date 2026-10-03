// Sprint 36 — medicine information needs a SECOND pharmacist (owner decision
// 2026-10-03, four eyes; C-17, C-19, C-46): the person who wrote or sent a version
// cannot approve it; buyers keep seeing the previous approved text until another
// registered pharmacist approves; a rejection with a reason goes back to the author.
import { call, check, q } from '../sprint5/lib.mjs';
import { P, ids, t } from './fixtures.mjs';

const content = (overview) => ({ overview, uses: ['Fever'], references: [{ source: 'Manufacturer’s package insert', date: 'March 2026' }] });
const save = (token, overview) => call('PUT', `/medicines/${P.info}/info/draft`, { token, body: { content: content(overview) } });
const submit = (token) => call('POST', `/medicines/${P.info}/info/submit`, { token });
const review = (token, approve, notes) => call('POST', `/medicines/${P.info}/info/review`, { token, body: { approve, notes } });
const publicView = async () => (await call('GET', `/medicines/${P.info}/info`)).json.data;

export async function runMedicineInfoFourEyes() {
  console.log('\nMedicine information: a second pharmacist approves');
  // v1: written by an admin, approved by pharmacist A — live
  await save(t.admin, 'S36 Infozorin eases fever.');
  await submit(t.admin);
  let r = await review(t.pharmacistA, true, 'Checked against the insert.');
  check('v1 (written by an admin) approved by pharmacist A', r.status === 200 && r.json.data?.status === 'approved'
    && r.json.data.reviewer_reg_no === 'S36-MSPC-0001' && !!r.json.data.reviewed_at, r.json);

  // v2: pharmacist A writes and sends it
  r = await save(t.pharmacistA, 'S36 Infozorin eases fever and mild pain.');
  check('pharmacist A saves a change (v2, not shown to buyers)', r.status === 200 && r.json.data?.version === 2, r.json);
  await submit(t.pharmacistA);
  let pub = await publicView();
  check('buyers still see v1 while v2 waits', pub?.version === 1 && pub.sections.overview === 'S36 Infozorin eases fever.', pub);
  r = await call('GET', '/medicines/info-review/queue', { token: t.pharmacistA });
  const mine = (r.json.data?.versions ?? []).find((v) => v.product_id === P.info);
  check('in the queue, pharmacist A is told it is their own', mine?.authored_by_you === true && mine.author_names.includes('S36 Pharmacist Asha'), mine);
  r = await call('GET', '/medicines/info-review/queue', { token: t.pharmacistB });
  check('… pharmacist B sees it as one to approve', (r.json.data?.versions ?? []).find((v) => v.product_id === P.info)?.authored_by_you === false, r.json.data);

  r = await review(t.pharmacistA, true, 'I checked my own words carefully.');
  check('the author cannot approve their own edit (plain message)', r.status === 403 && /another registered pharmacist must approve/.test(r.json.message), r.json);
  pub = await publicView();
  check('… and buyers still see v1', pub?.version === 1, pub);

  // Pharmacist B sends it back with a reason
  r = await review(t.pharmacistB, false, '“Mild pain” is not in the insert; remove it.');
  check('pharmacist B rejects v2 with a reason', r.status === 200 && r.json.data?.status === 'rejected' && r.json.data.returned_to_authors === 1, r.json);
  r = await call('GET', '/medicines/info-review/returned', { token: t.pharmacistA });
  const back = (r.json.data?.versions ?? []).find((v) => v.product_id === P.info);
  check('it is back with pharmacist A ("Returned to you"), with the reason and who decided', back?.version === 2
    && back.review_notes === '“Mild pain” is not in the insert; remove it.' && back.reviewed_by_name === 'S36 Pharmacist Bhaskar', back);
  r = await call('GET', '/medicines/info-review/returned', { token: t.pharmacistB });
  check('… not with pharmacist B', !(r.json.data?.versions ?? []).some((v) => v.product_id === P.info), r.json.data);
  pub = await publicView();
  check('buyers still see v1 after the rejection', pub?.version === 1, pub);

  // v3: the fix, approved by the second pharmacist — first with a cure claim (C-17, C-19)
  await call('PUT', `/medicines/${P.info}/info/draft`, { token: t.pharmacistA, body: { content: { ...content('S36 Infozorin eases fever.'),
    how_it_works: 'It cures arthritis for good.' } } });
  r = await call('GET', '/medicines/info-review/returned', { token: t.pharmacistA });
  check('once a new version is started, it leaves "Returned to you"', !(r.json.data?.versions ?? []).some((v) => v.product_id === P.info), r.json.data);
  await submit(t.pharmacistA);
  r = await review(t.pharmacistB, true, 'OK by me.');
  check('flagged claims still need the second pharmacist\'s reason of 20+ characters', r.status === 400 && /flagged claims/.test(r.json.message), r.json);
  await save(t.pharmacistA, 'S36 Infozorin eases fever.  Take after food.');
  await submit(t.pharmacistA);
  r = await review(t.pharmacistB, true, 'Matches the insert now.');
  check('pharmacist B approves v3', r.status === 200 && r.json.data?.status === 'approved' && r.json.data.reviewer_name === 'S36 Pharmacist Bhaskar'
    && r.json.data.reviewer_reg_no === 'S36-MSPC-0002', r.json);
  pub = await publicView();
  check('buyers now see v3, "Reviewed by" pharmacist B with registration number', pub?.version === 3
    && pub.reviewed?.name === 'S36 Pharmacist Bhaskar' && pub.reviewed.reg_no === 'S36-MSPC-0002', pub);
  const audit = await q(`SELECT action, performed_by, new_value FROM audit_logs WHERE action = 'product_info_approved' AND new_value->>'product_id' = $1
                         ORDER BY created_at DESC LIMIT 1`, [P.info]);
  check('the approval is audited with the approver\'s name, registration and the authors (C-46)', audit[0]?.performed_by === ids.pharmacistB
    && audit[0].new_value.reviewer_reg_no === 'S36-MSPC-0002' && audit[0].new_value.author_ids.includes(ids.pharmacistA), audit);

  // An editor who changes words while it waits becomes an author too
  await save(t.pharmacistA, 'S36 Infozorin v4 by A.');
  await save(t.pharmacistB, 'S36 Infozorin v4 by A, tidied by B.');
  await submit(t.pharmacistB);
  r = await review(t.pharmacistA, true, 'Approving after B tidied it.');
  check('anyone who edited the version is an author: A (wrote) cannot approve', r.status === 403, r.json);
  r = await review(t.pharmacistB, true, 'Approving my own tidy-up.');
  check('… nor can B (edited and sent)', r.status === 403, r.json);
  pub = await publicView();
  check('… and v3 stays live', pub?.version === 3, pub);

  // The database refuses a self-approval too
  let dbError = null;
  try {
    await q(`UPDATE product_info_versions SET status = 'approved', reviewed_by = $2, reviewed_at = NOW(), reviewer_name = 'x', reviewer_reg_no = 'y'
             WHERE product_id = $1 AND status = 'pending_review'`, [P.info, ids.pharmacistB]);
  } catch (e) { dbError = e; }
  check('the database refuses an approval by an author (product_info_four_eyes)', dbError?.constraint === 'product_info_four_eyes'
    || /product_info_four_eyes/.test(String(dbError?.message)), String(dbError?.message));
}
