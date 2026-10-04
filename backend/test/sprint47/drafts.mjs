// Sprint 47 — "Who may buy" in the new-product completion form (Sprint 29 / 46) and the optional
// buyer_restriction column of the catalogue suggestions import (a suggestion only: the
// pharmacist decides, with a reason).
import { call, check, q } from '../sprint5/lib.mjs';
import { HEAD, ITEMS, P, V, suggestion, t, upload, workbook } from './fixtures.mjs';

const HEAD16 = [...HEAD, 'buyer_restriction'];
const byItem = (r, item) => r.json.data?.results?.find((x) => x.item_name === item[0]);

export async function runDrafts() {
  console.log('\nI. Catalogue suggestions: optional buyer_restriction column (suggestion only)');
  let r = await call('GET', '/catalogue-suggestions/format', { token: t.pharmacist });
  check('the format lists buyer_restriction as an optional column with its values', r.status === 200
    && r.json.data.columns.length === 15 && r.json.data.optional_columns?.join() === 'buyer_restriction'
    && r.json.data.allowed.buyer_restriction?.join() === 'everyone,practitioners_only,trade_only', r.json.data);
  const file = await workbook([
    suggestion(ITEMS.draftA, { buyer_restriction: 'practitioners_only' }, HEAD16),
    suggestion(ITEMS.draftC, { buyer_restriction: 'nurses only' }, HEAD16),
  ], HEAD16);
  r = await upload(t.pharmacist, file, V.partner);
  check('a 16-column file is accepted', r.status === 200, r.json);
  check('the suggested restriction is attached to the draft', byItem(r, ITEMS.draftA)?.outcome === 'attached', byItem(r, ITEMS.draftA));
  check('an unknown value is reported, not imported', byItem(r, ITEMS.draftC)?.outcome === 'invalid'
    && /buyer_restriction "nurses only" is not one of/.test(byItem(r, ITEMS.draftC)?.message ?? ''), byItem(r, ITEMS.draftC));
  r = await upload(t.pharmacist, await workbook([suggestion(ITEMS.draftB)]), V.partner);
  check('a Sprint 46 file with the 15 columns still imports', r.status === 200 && byItem(r, ITEMS.draftB)?.outcome === 'attached', r.json);
  r = await call('GET', `/catalogue-drafts/${P.draftA}`, { token: t.pharmacist });
  check('the draft shows the suggestion ("Suggested — check"), the product itself still everyone', r.status === 200
    && r.json.data?.suggestion?.suggested?.buyer_restriction === 'practitioners_only' && r.json.data.buyer_restriction === 'everyone', r.json.data);

  console.log('\nJ. "Who may buy" when the pharmacist approves a new product');
  const approve = (token, body) => call('POST', `/catalogue-drafts/${P.draftA}/approve`, { token, body });
  r = await approve(t.admin, { buyer_restriction: { restriction: 'practitioners_only', reason: 'Hospital use only: specialist supervision (demo)' } });
  check('an admin cannot approve (403)', r.status === 403, r.json);
  r = await approve(t.pharmacist, { buyer_restriction: { restriction: 'practitioners_only', reason: 'short' } });
  check('a restriction without a proper reason → 400, nothing approved', r.status === 400
    && (await q(`SELECT status FROM catalogue_drafts WHERE product_id = $1`, [P.draftA]))[0].status === 'open', r.json);
  r = await approve(t.pharmacist, { buyer_restriction: { restriction: 'practitioners_only', reason: 'Hospital use only: specialist supervision (demo)' } });
  const after = (await q(`SELECT buyer_restriction, buyer_restriction_reason, catalogue_state FROM products WHERE id = $1`, [P.draftA]))[0];
  check('approved with the pharmacist\'s choice: doctors and hospitals only, with the reason', r.status === 200 && r.json.data?.buyer_restriction === 'practitioners_only'
    && after.buyer_restriction === 'practitioners_only' && /Hospital use only/.test(after.buyer_restriction_reason) && after.catalogue_state === 'live', { r: r.json, after });
  check('… logged', (await q(`SELECT 1 FROM product_buyer_restriction_log WHERE product_id = $1 AND new_restriction = 'practitioners_only'`, [P.draftA])).length === 1);
}
