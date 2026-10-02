// Which Dawabag product a row of the partner's file is. In order:
//   1. the partner's own item link (its item code, or name + unit + company, linked
//      before by the partner, an admin, or an earlier exact match),
//   2. the partner's existing listing with that item code as its SKU,
//   3. the catalogue: same name words and strengths, pack and company not in
//      conflict, and exactly one such product (or exactly one the partner already lists).
// Anything else "needs review" with suggestions; look-alikes are never auto-linked.
// Pure (the caller loads the context): unit-tested in match.test.ts.
import { makersAgree, nameTokens, packsAgree, parsePack, similarity, strengthTokens, tokenKey, FORM_WORDS } from './normalise';

export interface CatalogueProduct {
  id: string;
  name: string;
  generic_name: string | null;
  net_quantity: string | null;
  drug_schedule: string | null;
  manufacturer_name: string | null;
  marketed_by: string | null;
  mrp_paise: number;
  offer_price_paise: number;
  hsn_code: string | null;
  gst_rate: number | null;
  cold_chain: boolean;
}

export interface MatchContext {
  products: Map<string, CatalogueProduct>;
  /** tokenKey(name) → product ids */
  byKey: Map<string, string[]>;
  /** first name word → product ids (suggestions) */
  byWord: Map<string, string[]>;
  tokens: Map<string, string[]>;
  /** partner item_key → product id */
  links: Map<string, string>;
  /** partner's listing SKU (upper case) → product id */
  listingSkus: Map<string, string>;
  /** product ids the partner already lists */
  listed: Set<string>;
}

export function buildMatchContext(
  products: CatalogueProduct[],
  links: { item_key: string; product_id: string }[],
  listings: { product_id: string; partner_sku: string | null }[],
): MatchContext {
  const ctx: MatchContext = {
    products: new Map(), byKey: new Map(), byWord: new Map(), tokens: new Map(),
    links: new Map(links.map((l) => [l.item_key, l.product_id])),
    listingSkus: new Map(), listed: new Set(),
  };
  for (const l of listings) {
    ctx.listed.add(l.product_id);
    if (l.partner_sku) ctx.listingSkus.set(l.partner_sku.trim().toUpperCase(), l.product_id);
  }
  const push = (m: Map<string, string[]>, k: string, id: string) => { const a = m.get(k); if (a) a.push(id); else m.set(k, [id]); };
  for (const p of products) {
    const t = nameTokens(p.name);
    ctx.products.set(p.id, p);
    ctx.tokens.set(p.id, t);
    push(ctx.byKey, tokenKey(t), p.id);
    for (const w of [t[0], ...nameTokens(p.generic_name).slice(0, 1)]) if (w) push(ctx.byWord, w.slice(0, 4), p.id);
  }
  return ctx;
}

export interface RowIdentity {
  item_key: string | null;
  item_code: string | null;
  item_name: string | null;
  pack: string | null;
  manufacturer: string | null;
}

export type MatchMethod = 'item_link' | 'listing' | 'catalogue';

export interface Candidate { id: string; name: string; pack: string | null; schedule: string | null; mrp_paise: number; listed: boolean }

export interface MatchResult {
  productId: string | null;
  method: MatchMethod | null;
  /** Why it was not matched automatically (plain words) */
  reason: string | null;
  candidates: Candidate[];
}

const candidate = (ctx: MatchContext, id: string): Candidate => {
  const p = ctx.products.get(id)!;
  return { id, name: p.name, pack: p.net_quantity, schedule: p.drug_schedule, mrp_paise: p.mrp_paise, listed: ctx.listed.has(id) };
};

/** Name words of the row: the item name plus any strength written in the pack column. */
export function rowTokens(r: RowIdentity): string[] {
  const t = nameTokens(r.item_name);
  const packStrengths = strengthTokens(nameTokens(r.pack)).filter((s) => !/(ml|l|g|kg)$/.test(s) || !parsePack(r.pack));
  return [...t, ...packStrengths.filter((s) => !t.includes(s))];
}

function suggestions(ctx: MatchContext, tokens: string[], exclude: Set<string>): Candidate[] {
  const words = tokens.filter((w) => !FORM_WORDS.has(w) && !/^\d/.test(w)).slice(0, 3);
  const ids = new Set<string>();
  for (const w of words) for (const id of ctx.byWord.get(w.slice(0, 4)) ?? []) ids.add(id);
  return [...ids].filter((id) => !exclude.has(id))
    .map((id) => ({ id, score: similarity(tokens, ctx.tokens.get(id) ?? []) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((x) => candidate(ctx, x.id));
}

export function matchRow(r: RowIdentity, ctx: MatchContext): MatchResult {
  const tokens = rowTokens(r);
  // 1. Remembered link
  const linked = r.item_key ? ctx.links.get(r.item_key) : undefined;
  if (linked && ctx.products.has(linked)) return { productId: linked, method: 'item_link', reason: null, candidates: [] };
  // 2. The partner's own SKU on an existing listing
  const code = r.item_code?.trim().toUpperCase();
  const bySku = code ? ctx.listingSkus.get(code) : undefined;
  if (bySku && ctx.products.has(bySku)) return { productId: bySku, method: 'listing', reason: null, candidates: [] };
  if (!tokens.length) return { productId: null, method: null, reason: 'Item name is missing', candidates: [] };

  // 3. Catalogue: same words and strengths
  const same = ctx.byKey.get(tokenKey(tokens)) ?? [];
  // Without a pack column, only an explicit "15's" / "1x15" in the name counts ("650 TAB" is a strength)
  const namePack = String(r.item_name ?? '').match(/\d+\s*[x*]\s*\d+|\d+\s*'\s*s\b/i)?.[0];
  const rowPack = parsePack(r.pack) ?? (namePack ? parsePack(namePack) : null);
  const fits = same.filter((id) => {
    const p = ctx.products.get(id)!;
    return packsAgree(rowPack, parsePack(p.net_quantity)) && makersAgree(r.manufacturer, p.manufacturer_name ?? p.marketed_by);
  });
  if (fits.length === 1) return { productId: fits[0], method: 'catalogue', reason: null, candidates: [] };
  if (fits.length > 1) {
    const listed = fits.filter((id) => ctx.listed.has(id));
    if (listed.length === 1) return { productId: listed[0], method: 'listing', reason: null, candidates: [] };
    return { productId: null, method: null, reason: 'More than one Dawabag product has this name: choose the right one',
      candidates: fits.slice(0, 5).map((id) => candidate(ctx, id)) };
  }
  const cands = [...same.map((id) => candidate(ctx, id)), ...suggestions(ctx, tokens, new Set(same))].slice(0, 5);
  const reason = same.length
    ? 'Same name in the catalogue but a different pack or company: check and choose'
    : cands.length ? 'No exact match in the catalogue: choose the product or request a new one'
      : 'Not in the Dawabag catalogue yet: request it as a new product';
  return { productId: null, method: null, reason, candidates: cands };
}
