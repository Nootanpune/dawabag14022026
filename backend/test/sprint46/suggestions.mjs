// Sprint 46 — catalogue suggestions for ONE partner's DRAFT products (owner request
// 2026-10-04): matched through that partner's own item links (Sprint 45 matcher = the
// partner stock import's), stored on their own, never written into the product's
// decided fields; live products never touched; the pharmacist still decides and
// approves each product (C-10, C-19, C-25); each import audited (C-46).
import { call, check, q } from '../sprint5/lib.mjs';
import { CATEGORY, ExcelJS, HEAD, HSN, ITEMS, P, R, V, ids, suggestion, t, upload, workbook } from './fixtures.mjs';

const byItem = (r, item) => r.json.data?.results?.find((x) => x.item_name === item[0]);
const product = async (id) => (await q('SELECT * FROM products WHERE id = $1', [id]))[0];
const suggestions = async (id) => q('SELECT * FROM catalogue_draft_suggestions WHERE product_id = $1 ORDER BY imported_at, id', [id]);
const DECIDED = ['generic_name', 'strength', 'dosage_form', 'drug_schedule', 'category', 'hsn_code', 'gst_rate', 'product_class', 'is_new_drug', 'cold_chain'];

const FIRST = [
  suggestion(ITEMS.draft1, { note: 'Strength read from the demo strip' }),
  suggestion(ITEMS.draft2, { generic_name: 'S46 Demovita', strength: '1 mg', dosage_form: 'capsules', drug_schedule: 'Non-scheduled',
    category: 'S46 Demo Vitamins', hsn_code: '21069046', gst_rate: '18', confidence: 'medium', note: '' }),
  suggestion(ITEMS.draftX, { generic_name: 'S46 Demoxant', drug_schedule: 'X', confidence: 'low' }),
  suggestion(ITEMS.live, { generic_name: 'S46 Must not change', drug_schedule: 'H1' }),
  suggestion(ITEMS.partnerB),
  suggestion(ITEMS.requested, { generic_name: 'S46 Demoreq' }),
  suggestion(ITEMS.unknown),
  suggestion(['S46 BADSCHED 1 TAB', '1', 'S46DEMO'], { drug_schedule: 'Schedule K' }),
  suggestion(['S46 BADCLASS 1 TAB', '1', 'S46DEMO'], { product_class: 'gadget' }),
];

export async function runSuggestions() {
  console.log('\nTemplate, format and file checks');
  let r = await call('GET', '/catalogue-suggestions/template', { token: t.pharmacistA, raw: true });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(r.buf);
  const head = wb.getWorksheet('suggestions')?.getRow(1).values.slice(1);
  // Sprint 47: the template also carries the OPTIONAL buyer_restriction column (15-column files still import, below)
  check('Download template: an xlsx with the suggestions sheet and exactly the headings', r.status === 200 && /spreadsheetml/.test(r.type)
    && JSON.stringify(head) === JSON.stringify([...HEAD, 'buyer_restriction']), head);
  r = await call('GET', '/catalogue-suggestions/template', { token: t.admin, raw: true });
  check('… for admins too', r.status === 200);
  r = await call('GET', '/catalogue-suggestions/format', { token: t.admin });
  check('the allowed values come from the system (schedules incl. Non-scheduled, classes, GST slabs)', r.status === 200
    && r.json.data.allowed.drug_schedule.includes('Non-scheduled') && r.json.data.allowed.drug_schedule.includes('Schedule H1')
    && r.json.data.allowed.product_class.join() === 'drug,device,cosmetic,ayush,general' && r.json.data.allowed.gst_rate.join() === '0,5,12,18,28', r.json.data);
  r = await call('GET', '/catalogue-suggestions/format');
  check('the import needs a staff sign-in (401)', r.status === 401, r.json);
  r = await call('GET', '/catalogue-suggestions/format', { token: t.buyer });
  check('… and a staff role (buyer 403)', r.status === 403, r.json);

  const file = await workbook(FIRST);
  r = await upload(t.admin, { buffer: file });
  check('no partner chosen → 422 "Choose the partner"', r.status === 422 && r.json.message === 'Choose the partner', r.json);
  r = await upload(t.admin, { buffer: Buffer.from('item_name\n'), partnerId: V.A, name: 'suggestions.csv' });
  check('not an .xlsx → 422', r.status === 422, r.json);
  r = await upload(t.admin, { buffer: await workbook([], { head: ['item_name', 'schedule'] }), partnerId: V.A });
  check('wrong headings → 422 naming the columns', r.status === 422 && /exactly these columns/.test(r.json.message), r.json);
  r = await upload(t.admin, { buffer: await workbook(FIRST, { sheet: 'Sheet1' }), partnerId: V.A });
  check('no sheet named suggestions → 422', r.status === 422 && /suggestions/.test(r.json.message), r.json);
  r = await upload(t.buyer, { buffer: file, partnerId: V.A });
  check('a buyer cannot import (403)', r.status === 403, r.json);

  console.log('\nImport for partner A (admin)');
  const liveBefore = await product(P.live);
  r = await upload(t.admin, { buffer: file, partnerId: V.A });
  const res = r.json.data;
  check('the import answers 200 with counts', r.status === 200 && res?.partner?.id === V.A && res.rows === 9, r.json);
  check('matched DRAFT products get the suggestion (3 attached)', res?.counts.attached === 3
    && [ITEMS.draft1, ITEMS.draft2, ITEMS.draftX].every((i) => byItem(r, i)?.outcome === 'attached'), res?.results);
  check('the live product: "already in catalogue"', res?.counts.already_in_catalogue === 1 && byItem(r, ITEMS.live)?.outcome === 'already_in_catalogue'
    && /live products are not changed/.test(byItem(r, ITEMS.live)?.message), byItem(r, ITEMS.live));
  check('unmatched rows: "no draft yet" — partner B\'s draft too (partner scoping)', res?.counts.no_draft_yet === 3
    && byItem(r, ITEMS.partnerB)?.outcome === 'no_draft_yet' && byItem(r, ITEMS.unknown)?.outcome === 'no_draft_yet'
    && /Create drafts/.test(byItem(r, ITEMS.unknown)?.message), res?.results);
  check('… the partner\'s open request without a draft is offered for "Create drafts"', byItem(r, ITEMS.requested)?.request_id === R.requested
    && res.open_request_ids.join() === R.requested, { row: byItem(r, ITEMS.requested), ids: res?.open_request_ids });
  check('… listed in the CSV download', res?.no_draft_csv.startsWith('row,item_name,pack,company,open_request,reason')
    && /S46 UNKNOWNIX 1 TAB/.test(res.no_draft_csv) && /S46 DEMOREQ 5 TAB,10 TAB,S46DEMO,yes/.test(res.no_draft_csv), res?.no_draft_csv);
  check('invalid schedule / class values reported, not imported', res?.counts.invalid === 2
    && /drug_schedule "Schedule K"/.test(res.results.find((x) => x.item_name === 'S46 BADSCHED 1 TAB')?.message)
    && /product_class "gadget"/.test(res.results.find((x) => x.item_name === 'S46 BADCLASS 1 TAB')?.message), res?.results);
  check('a new category / HSN code is kept and flagged ("create with Alt+C if right")', res?.counts.flagged === 1
    && byItem(r, ITEMS.draft2)?.flags.map((f) => f.field).join() === 'category,hsn_code'
    && /New category "S46 Demo Vitamins".*Alt\+C/.test(byItem(r, ITEMS.draft2)?.flags[0].message), byItem(r, ITEMS.draft2));

  const liveAfter = await product(P.live);
  check('the live product is untouched', DECIDED.every((k) => JSON.stringify(liveBefore[k]) === JSON.stringify(liveAfter[k]))
    && String(liveAfter.updated_at) === String(liveBefore.updated_at) && (await suggestions(P.live)).length === 0, liveAfter);
  const d1 = await product(P.draft1);
  check('the draft\'s decided fields are NOT filled by the import', d1.generic_name === null && d1.strength === null && d1.drug_schedule === null
    && d1.category === null && d1.hsn_code === null && d1.gst_rate === null && d1.dosage_form === null, d1);
  check('… cold chain still undecided (C-25)', (await q('SELECT cold_chain_decided FROM catalogue_drafts WHERE product_id = $1', [P.draft1]))[0].cold_chain_decided === false);
  const [s1] = await suggestions(P.draft1);
  check('the suggestion is stored with confidence, note, partner and who imported it', s1?.confidence === 'high' && s1.note === 'Strength read from the demo strip'
    && s1.partner_id === V.A && s1.imported_by === ids.admin && s1.suggested.drug_schedule === 'Schedule H' && s1.suggested.cold_chain === false
    && s1.suggested.category === CATEGORY && s1.suggested.hsn_code === HSN && s1.suggested.gst_rate === 12, s1);
  const [s2] = await suggestions(P.draft2);
  check('values read as the form spells them (capsules → Capsule, Non-scheduled)', s2?.suggested.dosage_form === 'Capsule'
    && s2.suggested.drug_schedule === 'Non-scheduled' && s2.note === null, s2?.suggested);
  const blocked = await q(`UPDATE catalogue_draft_suggestions SET confidence = 'low' WHERE id = $1`, [s1.id]).then(() => false, (e) => /cannot be changed/.test(e.message));
  check('a stored suggestion cannot be changed (immutable)', blocked);

  const audit = await q(`SELECT * FROM audit_logs WHERE action = 'catalogue_suggestions_imported' AND new_value->>'vendor_id' = $1 ORDER BY created_at`, [V.A]);
  check('the import is audited: who, partner, counts (C-46)', audit.length === 1 && audit[0].performed_by === ids.admin
    && audit[0].new_value.attached === 3 && audit[0].new_value.no_draft_yet === 3 && audit[0].new_value.invalid === 2
    && audit[0].new_value.partner_name === 'S46 Demo Partner A', audit[0]?.new_value);

  console.log('\nThe pharmacist\'s form shows the suggestion');
  r = await call('GET', `/catalogue-drafts/${P.draft1}`, { token: t.pharmacistA });
  check('the draft carries the suggestion (values, confidence, note, partner, importer)', r.status === 200
    && r.json.data.suggestion?.suggested?.drug_schedule === 'Schedule H' && r.json.data.suggestion.confidence === 'high'
    && r.json.data.suggestion.partner_name === 'S46 Demo Partner A' && r.json.data.suggestion.imported_by_name === 'S46 Admin', r.json.data?.suggestion);
  check('… and still says what the pharmacist must decide', r.json.data.drug_schedule === null && /drug schedule/.test(r.json.data.problems.join()), r.json.data?.problems);
  r = await call('GET', '/catalogue-drafts?suggested=true&limit=200', { token: t.pharmacistA });
  const order = (r.json.data?.drafts ?? []).filter((d) => [P.draft1, P.draft2, P.draftX].includes(d.id)).map((d) => d.suggestion.confidence);
  check('"Drafts with suggestions": high confidence first', r.status === 200 && order.join() === 'high,medium,low'
    && r.json.data.drafts.every((d) => d.suggestion), order);
  check('… with counts by confidence', r.json.data.with_suggestions?.high >= 1 && r.json.data.with_suggestions.medium >= 1 && r.json.data.with_suggestions.low >= 1,
    r.json.data?.with_suggestions);
  r = await call('GET', `/catalogue-drafts?suggested=true&q=${encodeURIComponent('S46 DEMOBEE')}`, { token: t.pharmacistA });
  check('… partner B\'s draft has no suggestion from partner A\'s file', (r.json.data?.drafts ?? []).length === 0, r.json.data?.drafts);

  console.log('\nThe pharmacist decides; the suggestion is not a decision');
  r = await call('POST', `/catalogue-drafts/${P.draft1}/approve`, { token: t.pharmacistA, body: {} });
  check('approve refused while only a suggestion exists (nothing decided)', r.status === 400 && /drug schedule/.test(r.json.message), r.json);
  // The pharmacist submits most suggested values, but changes the schedule and strength after checking the pack
  r = await call('PATCH', `/catalogue-drafts/${P.draft1}`, { token: t.pharmacistA, body: {
    generic_name: 'S46 Democillin', strength: '250 mg', dosage_form: 'Tablet', drug_schedule: 'Schedule G', cold_chain: false,
    product_class: 'drug', is_new_drug: false, category: CATEGORY, hsn_code: HSN, gst_rate: 12 } });
  check('the pharmacist saves their own choices', r.status === 200 && r.json.data.problems.length === 0, r.json.data?.problems ?? r.json);
  r = await call('POST', `/catalogue-drafts/${P.draft1}/approve`, { token: t.admin, body: {} });
  check('only a pharmacist approves (C-19)', r.status === 403, r.json);
  r = await call('POST', `/catalogue-drafts/${P.draft1}/approve`, { token: t.pharmacistA, body: {} });
  check('the pharmacist approves', r.status === 200 && r.json.data?.status === 'approved', r.json);
  const approved = await product(P.draft1);
  check('the product has the pharmacist\'s choices, not the suggestion', approved.drug_schedule === 'Schedule G' && approved.strength === '250 mg'
    && approved.generic_name === 'S46 Democillin' && approved.catalogue_state === 'live', approved);
  const [ap] = await q(`SELECT * FROM audit_logs WHERE action = 'catalogue_draft_approved' AND new_value->>'product_id' = $1`, [P.draft1]);
  check('… and the approval audit records them (C-46)', ap?.performed_by === ids.pharmacistA && ap.new_value.drug_schedule === 'Schedule G'
    && ap.new_value.strength === '250 mg', ap?.new_value);
  r = await call('GET', `/catalogue-drafts/${P.draft1}`, { token: t.pharmacistA });
  check('… once decided, the suggestion is no longer shown', r.json.data?.status === 'approved' && r.json.data.suggestion === null, r.json.data?.suggestion);

  // Schedule X suggested and accepted by the pharmacist: the existing rule still applies (C-10)
  await call('PATCH', `/catalogue-drafts/${P.draftX}`, { token: t.pharmacistB, body: { drug_schedule: 'Schedule X', generic_name: 'S46 Demoxant', category: CATEGORY, gst_rate: 12 } });
  r = await call('POST', `/catalogue-drafts/${P.draftX}/approve`, { token: t.pharmacistB, body: {} });
  check('Schedule X is still approved as never sold online (not_listed, C-10)', r.status === 200 && r.json.data?.status === 'not_listed'
    && (await product(P.draftX)).is_active === false, r.json);

  console.log('\nRe-import');
  const before = (await q(`SELECT COUNT(*)::int AS n FROM catalogue_draft_suggestions WHERE product_id = ANY($1)`, [Object.values(P)]))[0].n;
  r = await upload(t.admin, { buffer: file, partnerId: V.A });
  const after = (await q(`SELECT COUNT(*)::int AS n FROM catalogue_draft_suggestions WHERE product_id = ANY($1)`, [Object.values(P)]))[0].n;
  check('the same file again: approved product "already in catalogue", open draft unchanged, nothing added', r.status === 200
    && byItem(r, ITEMS.draft1)?.outcome === 'already_in_catalogue' && byItem(r, ITEMS.draft2)?.outcome === 'unchanged'
    && byItem(r, ITEMS.draftX)?.outcome === 'no_draft_yet' && before === after, r.json.data?.results);
  check('… the approved product keeps the pharmacist\'s choices', (await product(P.draft1)).drug_schedule === 'Schedule G');
  const changed = FIRST.map((x) => (x[0] === ITEMS.draft2[0] ? suggestion(ITEMS.draft2, { generic_name: 'S46 Demovita', strength: '2 mg',
    dosage_form: 'Capsule', drug_schedule: 'Non-scheduled', category: CATEGORY, gst_rate: '12', confidence: 'high', note: 'Second look' }) : x));
  r = await upload(t.pharmacistA, { buffer: await workbook(changed), partnerId: V.A });
  const s2all = await suggestions(P.draft2);
  check('a changed suggestion for a still-open draft replaces it (new immutable row, the old one kept)', byItem(r, ITEMS.draft2)?.outcome === 'replaced'
    && s2all.length === 2 && s2all[0].suggested.strength === '1 mg' && s2all[1].suggested.strength === '2 mg' && s2all[1].imported_by === ids.pharmacistA, s2all);
  r = await call('GET', `/catalogue-drafts/${P.draft2}`, { token: t.pharmacistA });
  check('… the form shows the newest one', r.json.data?.suggestion?.suggested?.strength === '2 mg' && r.json.data.suggestion.confidence === 'high'
    && r.json.data.suggestion.flags.length === 0 && r.json.data.strength === null, r.json.data?.suggestion);

  console.log('\nCreate drafts for the matched requests first (Sprint 29), then import again');
  r = await call('POST', '/admin/partner-product-requests/drafts', { token: t.pharmacistA, body: { request_ids: [R.requested] } });
  check('creating drafts stays an admin action (pharmacist 403)', r.status === 403, r.json);
  r = await call('POST', '/admin/partner-product-requests/drafts', { token: t.admin, body: { request_ids: [R.requested] } });
  check('the admin creates the draft for exactly the offered request', r.status === 201 && r.json.data.drafts_created === 1, r.json);
  const reqDraft = r.json.data.product_ids?.[0];
  r = await upload(t.admin, { buffer: file, partnerId: V.A });
  check('… importing again attaches its suggestion', byItem(r, ITEMS.requested)?.outcome === 'attached' && byItem(r, ITEMS.requested)?.product_id === reqDraft
    && r.json.data.open_request_ids.length === 0, byItem(r, ITEMS.requested));
  check('… and its decided fields stay empty', (await product(reqDraft))?.generic_name === null);

  console.log('\nPartner scoping');
  r = await upload(t.pharmacistB, { buffer: file, partnerId: V.B });
  check('a pharmacist imports for partner B: only B\'s draft matches', r.status === 200 && byItem(r, ITEMS.partnerB)?.outcome === 'attached'
    && r.json.data.counts.attached === 1 && byItem(r, ITEMS.draft2)?.outcome === 'no_draft_yet' && byItem(r, ITEMS.live)?.outcome === 'no_draft_yet', r.json.data?.results);
  const [sb] = await suggestions(P.partnerB);
  check('… stored for partner B, imported by that pharmacist', sb?.partner_id === V.B && sb.imported_by === ids.pharmacistB, sb);
}
