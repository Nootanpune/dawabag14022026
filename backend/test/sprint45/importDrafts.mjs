// Sprint 45 — medicine-information drafts written outside Dawabag, imported for ONE
// partner's products (owner request 2026-10-03): drafts only; a registered pharmacist
// checks and sends, a SECOND one approves (Sprint 36 four eyes, C-19); buyers see nothing
// until then; never touches approved / pending text; audited without content (C-46).
import { call, check, q } from '../sprint5/lib.mjs';
import { API } from '../sprint5/lib.mjs';
import { ExcelJS, HEAD, ITEMS, P, V, content, ids, link, t, upload, workbook } from './fixtures.mjs';

const byItem = (r, item) => r.json.data?.results?.find((x) => x.item_name === item[0]);
const versions = async (productId) => q('SELECT * FROM product_info_versions WHERE product_id = $1 ORDER BY version', [productId]);
const publicView = async (productId) => (await call('GET', `/medicines/${productId}/info`)).json.data;

const FIRST = [
  [ITEMS.live, 'Democillin 500 mg', 'high', 'Strength checked on the strip', content('S45 Democillin eases demo fever.')],
  [ITEMS.draft, 'Demonew 5 mg', 'medium', null, content('S45 Demonew text.', { how_it_works: 'It cures arthritis for good.' })],
  [ITEMS.approved, 'Demoapp 250 mg', 'high', null, content('S45 import must not replace approved words.')],
  [ITEMS.pending, 'Demopend 40 mg', 'low', null, content('S45 import must not replace pending words.')],
  [ITEMS.partnerB, 'Demobee 100 mg', 'high', null, content('S45 Demobee text.')],
  [ITEMS.later, 'Demolater 50 mg', 'high', null, content('S45 Demolater text.')],
  [['S45 DEMOBROKEN 1 TAB', '1', 'S45DEMO'], 'Demobroken', 'high', null, '{ "overview": "unterminated'],
];

export async function runImportDrafts() {
  console.log('\nTemplate and file checks');
  let r = await call('GET', '/medicines/info-imports/template', { token: t.pharmacistA, raw: true });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(r.buf);
  const head = wb.getWorksheet('drafts')?.getRow(1).values.slice(1);
  check('Download template: an xlsx with the drafts sheet and exactly the headings', r.status === 200 && /spreadsheetml/.test(r.type)
    && JSON.stringify(head) === JSON.stringify(HEAD), head);
  r = await call('GET', '/medicines/info-imports/template', { token: t.admin, raw: true });
  check('… for admins too', r.status === 200);
  r = await call('GET', '/medicines/info-imports/partners', { token: t.pharmacistA });
  check('the partners to choose from (id and name)', r.status === 200 && r.json.data.partners.some((p) => p.id === V.A && p.name === 'S45 Demo Partner A'), r.json);

  const file = await workbook(FIRST);
  r = await upload(t.admin, { buffer: file });
  check('no partner chosen → 422 "Choose the partner"', r.status === 422 && r.json.message === 'Choose the partner', r.json);
  r = await upload(t.admin, { buffer: Buffer.from('item_name\n'), partnerId: V.A, name: 'drafts.csv' });
  check('not an .xlsx → 422', r.status === 422, r.json);
  r = await upload(t.admin, { buffer: await workbook([], { head: ['item_name', 'json'] }), partnerId: V.A });
  check('wrong headings → 422 naming the columns', r.status === 422 && /exactly these columns/.test(r.json.message), r.json);
  r = await upload(t.admin, { buffer: await workbook(FIRST, { sheet: 'Sheet1' }), partnerId: V.A });
  check('no sheet named drafts → 422', r.status === 422 && /drafts/.test(r.json.message), r.json);
  const buyerless = await call('GET', '/medicines/info-imports/counts');
  check('the import pages need a staff sign-in', buyerless.status === 401, buyerless.json);

  console.log('\nImport for partner A (admin)');
  r = await upload(t.admin, { buffer: file, partnerId: V.A });
  const res = r.json.data;
  check('the import answers 200 with counts', r.status === 200 && res?.partner?.id === V.A && res.rows === 7, r.json);
  check('matched rows → drafts created (live and draft products)', res?.counts.created === 2
    && byItem(r, ITEMS.live)?.outcome === 'created' && byItem(r, ITEMS.draft)?.outcome === 'created'
    && byItem(r, ITEMS.draft)?.product_state === 'draft', res?.counts);
  check('approved and pending-review products skipped: "already has information"', res?.counts.already_has_information === 2
    && /approved/.test(byItem(r, ITEMS.approved)?.message) && /waiting/.test(byItem(r, ITEMS.pending)?.message), res?.results);
  check('unmatched rows reported "not in catalogue yet" — incl. partner B\'s item (partner scoping)', res?.counts.not_in_catalogue === 2
    && byItem(r, ITEMS.partnerB)?.outcome === 'not_in_catalogue' && byItem(r, ITEMS.later)?.outcome === 'not_in_catalogue', res?.results);
  check('… listed in the CSV download', /S45 DEMOBEE 100 TAB/.test(res?.not_in_catalogue_csv) && /S45 DEMOLATER 50 TAB/.test(res?.not_in_catalogue_csv)
    && res.not_in_catalogue_csv.startsWith('row,item_name,pack,company,reason'), res?.not_in_catalogue_csv);
  check('invalid content_json reported, not imported', res?.counts.invalid === 1
    && /not valid JSON/.test(res.results.find((x) => x.item_name === 'S45 DEMOBROKEN 1 TAB')?.message), res?.results);
  check('the restricted-claims check ran on import (flags shown)', byItem(r, ITEMS.draft)?.flags?.some((f) => f.condition === 'arthritis')
    && res.counts.flagged === 1, byItem(r, ITEMS.draft));

  const [v] = await versions(P.live);
  check('the version is a DRAFT marked imported, with composition, confidence and note', v?.status === 'draft' && v.source === 'imported_draft'
    && v.import_meta.assumed_composition === 'Democillin 500 mg' && v.import_meta.composition_confidence === 'high'
    && v.import_meta.drafting_note === 'Strength checked on the strip' && v.import_partner_id === V.A, v);
  check('the importer is NOT an author (author_ids empty, no created_by / updated_by)', v?.author_ids.length === 0 && !v.created_by && !v.updated_by, v);
  const [d] = await versions(P.draft);
  check('flags are stored on the draft (C-19)', Array.isArray(d?.flags) && d.flags.length === 1, d?.flags);
  const appr = await versions(P.approved);
  check('the approved version is untouched', appr.length === 1 && appr[0].status === 'approved' && appr[0].content.overview === 'S45 approved words.', appr);
  const pend = await versions(P.pending);
  check('the pending-review version is untouched', pend.length === 1 && pend[0].status === 'pending_review' && pend[0].content.overview === 'S45 pending words.', pend);
  check('buyers see nothing for the imported product', (await publicView(P.live))?.available === false);

  const audit = await q(`SELECT * FROM audit_logs WHERE action = 'product_info_drafts_imported' AND new_value->>'vendor_id' = $1 ORDER BY created_at`, [V.A]);
  check('the import is audited: who, partner, counts (C-46)', audit.length === 1 && audit[0].performed_by === ids.admin
    && audit[0].new_value.created === 2 && audit[0].new_value.not_in_catalogue === 2 && audit[0].new_value.partner_name === 'S45 Demo Partner A', audit[0]?.new_value);
  check('… and never the words', !/Democillin eases|arthritis|Demo use/.test(JSON.stringify(audit[0] ?? {})), audit[0]?.new_value);

  console.log('\nThe pharmacist\'s queue and the editor');
  r = await call('GET', `/medicines/info-imports/drafts?partner_id=${V.A}`, { token: t.pharmacistA });
  const queue = r.json.data?.versions ?? [];
  check('"Imported drafts to check" for partner A lists both drafts', r.status === 200 && [P.live, P.draft].every((id) => queue.some((x) => x.product_id === id))
    && queue.find((x) => x.product_id === P.live)?.import_meta?.assumed_composition === 'Democillin 500 mg', queue);
  r = await call('GET', `/medicines/info-imports/drafts?partner_id=${V.B}`, { token: t.pharmacistA });
  check('… partner B has none', (r.json.data?.versions ?? []).length === 0, r.json.data);
  r = await call('GET', '/medicines/info-imports/counts', { token: t.pharmacistA });
  const countA = r.json.data?.partners?.find((x) => x.partner_id === V.A);
  check('counts on the Medicine information pages (to check 2, waiting 0)', countA?.to_check === 2 && countA.waiting_approval === 0, r.json.data);
  r = await call('GET', `/medicines/${P.live}/info/editor`, { token: t.pharmacistA });
  check('the editor gets the imported marker for the banner', r.json.data?.open?.source === 'imported_draft'
    && r.json.data.open.import_meta?.composition_confidence === 'high' && r.json.data.open.import_partner_name === 'S45 Demo Partner A', r.json.data?.open);

  console.log('\nCheck, send and approve (four eyes)');
  r = await call('POST', `/medicines/${P.live}/info/review`, { token: t.admin, body: { approve: true, notes: 'Imported it, approving it.' } });
  check('the importer (admin) cannot approve', r.status === 403, r.json);
  r = await call('POST', `/medicines/${P.live}/info/review`, { token: t.pharmacistB, body: { approve: true, notes: 'Approve straight away.' } });
  check('nobody can approve an imported draft before a pharmacist sends it (409)', r.status === 409, r.json);
  r = await call('POST', `/medicines/${P.live}/info/submit`, { token: t.admin });
  check('an admin cannot send an imported draft — a registered pharmacist must check it', r.status === 403 && /registered pharmacist/.test(r.json.message), r.json);
  r = await call('PUT', `/medicines/${P.live}/info/draft`, { token: t.pharmacistA,
    body: { content: content('S45 Democillin eases demo fever. Checked against the insert.') } });
  check('pharmacist A checks and edits it', r.status === 200, r.json);
  r = await call('POST', `/medicines/${P.live}/info/submit`, { token: t.pharmacistA });
  check('pharmacist A sends it', r.status === 200 && r.json.data?.status === 'pending_review', r.json);
  const [sent] = await versions(P.live);
  check('pharmacist A is now its author; the source stays "imported"', sent.author_ids.length === 1 && sent.author_ids[0] === ids.pharmacistA
    && sent.source === 'imported_draft', sent);
  r = await call('POST', `/medicines/${P.live}/info/review`, { token: t.pharmacistA, body: { approve: true, notes: 'My own check.' } });
  check('pharmacist A cannot approve what they sent', r.status === 403, r.json);
  check('buyers still see nothing', (await publicView(P.live))?.available === false);
  r = await call('POST', `/medicines/${P.live}/info/review`, { token: t.pharmacistB, body: { approve: true, notes: 'Second check against the insert.' } });
  check('pharmacist B approves', r.status === 200 && r.json.data?.status === 'approved', r.json);
  const pub = await publicView(P.live);
  check('… now public, "Reviewed by" pharmacist B', pub?.available === true && pub.reviewed?.reg_no === 'S45-MSPC-0002'
    && /Checked against the insert/.test(pub.sections.overview), pub);
  check('… and the import\'s staff notes are not in the buyer view', !/Democillin 500 mg|Strength checked/.test(JSON.stringify(pub)), pub);

  console.log('\nRe-import');
  const before = (await q(`SELECT COUNT(*)::int AS n FROM product_info_versions WHERE product_id = ANY($1)`, [Object.values(P)]))[0].n;
  r = await upload(t.admin, { buffer: file, partnerId: V.A });
  const after = (await q(`SELECT COUNT(*)::int AS n FROM product_info_versions WHERE product_id = ANY($1)`, [Object.values(P)]))[0].n;
  check('the same file again changes nothing (idempotent)', r.status === 200 && r.json.data.counts.created === 0 && r.json.data.counts.replaced === 0
    && before === after && byItem(r, ITEMS.live)?.outcome === 'already_has_information' && byItem(r, ITEMS.draft)?.outcome === 'already_has_information', r.json.data?.counts);
  await link(V.A, ITEMS.later, P.later);
  r = await upload(t.admin, { buffer: file, partnerId: V.A });
  check('… after the "later" item is linked, re-importing fills it', byItem(r, ITEMS.later)?.outcome === 'created'
    && r.json.data.counts.created === 1 && r.json.data.counts.not_in_catalogue === 1, r.json.data?.results);
  r = await upload(t.admin, { buffer: file, partnerId: V.A, replace: true });
  check('"replace unapproved drafts only" with the same words: unchanged', r.status === 200 && byItem(r, ITEMS.draft)?.outcome === 'unchanged'
    && byItem(r, ITEMS.live)?.outcome === 'already_has_information' && byItem(r, ITEMS.pending)?.outcome === 'already_has_information', r.json.data?.results);
  await call('PUT', `/medicines/${P.draft}/info/draft`, { token: t.pharmacistC, body: { content: content('S45 Demonew text, edited by C.') } });
  const changed = FIRST.map((x) => (x[0] === ITEMS.draft ? [x[0], 'Demonew 5 mg', 'low', 'Second drafting', content('S45 Demonew text, redrafted.')] : x));
  r = await upload(t.admin, { buffer: await workbook(changed), partnerId: V.A, replace: true });
  const [redrafted] = (await versions(P.draft)).filter((x) => x.status === 'draft');
  check('… with new words: the draft is replaced in place (no new version), authors reset', byItem(r, ITEMS.draft)?.outcome === 'replaced'
    && redrafted?.content.overview === 'S45 Demonew text, redrafted.' && redrafted.author_ids.length === 0
    && redrafted.import_meta.composition_confidence === 'low' && (await versions(P.draft)).length === 1, redrafted);
  check('… approved text is never touched by a replace', (await versions(P.live)).filter((x) => x.status === 'approved').length === 1
    && (await versions(P.approved))[0].content.overview === 'S45 approved words.');

  console.log('\nPartner scoping');
  r = await upload(t.pharmacistC, { buffer: file, partnerId: V.B });
  check('a pharmacist imports for partner B: only B\'s item matches', r.status === 200 && byItem(r, ITEMS.partnerB)?.outcome === 'created'
    && r.json.data.counts.created === 1 && byItem(r, ITEMS.live)?.outcome === 'not_in_catalogue' && byItem(r, ITEMS.draft)?.outcome === 'not_in_catalogue', r.json.data?.results);
  r = await call('GET', `/medicines/info-imports/drafts?partner_id=${V.B}`, { token: t.pharmacistA });
  check('… and it is in partner B\'s list', (r.json.data?.versions ?? []).map((x) => x.product_id).join() === P.partnerB, r.json.data);
  const [bee] = await versions(P.partnerB);
  check('… the importing pharmacist is not its author either', bee?.author_ids.length === 0 && bee.import_partner_id === V.B, bee);
  void API;
}
