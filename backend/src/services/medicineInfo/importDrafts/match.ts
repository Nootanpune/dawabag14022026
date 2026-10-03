// Sprint 45 — which Dawabag product a drafts row is, for ONE partner. The same matching
// as that partner's stock import (partnerStockImport: itemKey + matchRow over the
// partner's own item links and listings): item name + pack + company → the partner's
// item key → the partner's link (or new-product request) → product. Only that partner's
// items count (owner: information for the chosen partner's products only), so a name
// that happens to match a catalogue product the partner has no link to or listing of is
// NOT taken — it is reported for a person to link first. Nothing here is a new matcher.
import { Db, loadMatchContext } from '../../partnerStockImport/evaluate';
import { MatchContext, matchRow } from '../../partnerStockImport/match';

export interface DraftLink { product_id: string; state: 'live' | 'draft' }

export interface DraftMatcher {
  ctx: MatchContext;
  /** The partner's item key → a DRAFT product it is linked to (Sprint 29 drafts, or a linked request) */
  draftLinks: Map<string, string>;
}

/** Loads the partner's matching context (the stock import's own loader) plus its links to draft products. */
export async function loadDraftMatcher(db: Db, partnerId: string): Promise<DraftMatcher> {
  const ctx = await loadMatchContext(db, partnerId);
  const { rows } = await db.query<{ item_key: string; product_id: string }>(
    `SELECT l.item_key, l.product_id FROM partner_item_links l JOIN products p ON p.id = l.product_id
      WHERE l.partner_id = $1 AND p.catalogue_state = 'draft' AND p.deleted_at IS NULL
     UNION
     SELECT r.item_key, r.product_id FROM partner_product_requests r JOIN products p ON p.id = r.product_id
      WHERE r.partner_id = $1 AND r.status IN ('drafted', 'linked') AND p.catalogue_state = 'draft' AND p.deleted_at IS NULL`,
    [partnerId]);
  return { ctx, draftLinks: new Map(rows.map((r) => [r.item_key, r.product_id])) };
}

export interface DraftMatch {
  productId: string | null;
  how: 'item_link' | 'draft_link' | 'listing' | null;
  /** Plain words when not matched */
  reason: string | null;
}

export const NOT_IN_CATALOGUE = 'Not in the catalogue yet: this partner\'s item is not linked to a Dawabag product (live or draft)';

/** Pure: the row's partner item → product, using only the partner's own links and listings. */
export function matchDraftRow(row: { item_key: string | null; item_name: string; pack: string | null; company: string | null },
  m: DraftMatcher): DraftMatch {
  const res = matchRow({ item_key: row.item_key, item_code: null, item_name: row.item_name, pack: row.pack, manufacturer: row.company }, m.ctx);
  // 1. The partner's remembered link to a live product
  if (res.productId && res.method === 'item_link') return { productId: res.productId, how: 'item_link', reason: null };
  // 2. The partner's item linked to a draft product a pharmacist is completing (Sprint 29)
  const draft = row.item_key ? m.draftLinks.get(row.item_key) : undefined;
  if (draft) return { productId: draft, how: 'draft_link', reason: null };
  // 3. A product the partner already lists (its stock import would match it the same way)
  if (res.productId && (res.method === 'listing' || m.ctx.listed.has(res.productId))) {
    return { productId: res.productId, how: 'listing', reason: null };
  }
  if (res.productId) {
    const name = m.ctx.products.get(res.productId)?.name ?? 'a catalogue product';
    return { productId: null, how: null,
      reason: `${NOT_IN_CATALOGUE}. The name matches ${name}, but this partner has no link to it: apply the partner's stock file or link the item first` };
  }
  return { productId: null, how: null, reason: NOT_IN_CATALOGUE };
}
