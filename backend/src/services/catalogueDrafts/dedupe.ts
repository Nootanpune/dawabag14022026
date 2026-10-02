// Sprint 29 — which partner requests become one draft product. Pure: unit-tested.
//   • Requests in one batch with the same normalised name + strength, pack and
//     company become ONE draft (e.g. two partners stocking the same item).
//   • A request that clearly matches ONE product already in the catalogue (an active
//     product or an earlier draft) is linked to it instead of making a duplicate.
//     "Clearly" uses the Sprint 27 matching words: same name words and strengths,
//     the same pack (both known, or both blank) and companies not in conflict.
//   • Nothing clinical is guessed here; a request without MRP or that looks like
//     more than one existing product is left for a person.
import { rowTokens } from '../partnerStockImport/match';
import { makersAgree, nameTokens, packsAgree, parsePack, tokenKey } from '../partnerStockImport/normalise';

export interface DraftRequest {
  id: string;
  partner_id: string;
  item_key: string;
  item_name: string;
  pack: string | null;
  manufacturer: string | null;
  gst_rate: number | string | null;
  mrp_paise: number | null;
}

export interface ExistingProduct {
  id: string;
  name: string;
  net_quantity: string | null;
  manufacturer_name: string | null;
  marketed_by: string | null;
  drug_schedule: string | null;
  catalogue_state: string;        // 'live' (active) or 'draft'
}

export type PlanGroup =
  | { key: string; requests: DraftRequest[]; action: 'create'; lead: DraftRequest }
  | { key: string; requests: DraftRequest[]; action: 'existing'; product: ExistingProduct }
  | { key: string; requests: DraftRequest[]; action: 'skip'; reason: string };

const clean = (v: unknown) => String(v ?? '').toLowerCase().normalize('NFKC').replace(/[^a-z0-9%.]+/g, ' ').trim();

const identity = (r: Pick<DraftRequest, 'item_name' | 'pack' | 'manufacturer'>) =>
  ({ item_key: null, item_code: null, item_name: r.item_name, pack: r.pack, manufacturer: r.manufacturer });

/** Pack as one comparable value ("10 TAB" and "10's" → "10unit"); text when it has no count. */
export function packKey(pack: string | null | undefined): string {
  const p = parsePack(pack);
  return p ? `${p.count}${p.unit}` : clean(pack);
}

/** Same normalised name + strength, pack and company → same key. */
export function requestKey(r: Pick<DraftRequest, 'item_name' | 'pack' | 'manufacturer'>): string {
  return `${tokenKey(rowTokens(identity(r)))}|${packKey(r.pack)}|${clean(r.manufacturer)}`;
}

/** Packs agree when both are known and equal, or both are blank / uncountable and the same text. */
function samePack(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = parsePack(a);
  const y = parsePack(b);
  if (x && y) return packsAgree(x, y);
  return !x && !y && clean(a) === clean(b);
}

export function fitsExisting(r: DraftRequest, p: ExistingProduct): boolean {
  return tokenKey(rowTokens(identity(r))) === tokenKey(nameTokens(p.name))
    && samePack(r.pack, p.net_quantity)
    && makersAgree(r.manufacturer, p.manufacturer_name ?? p.marketed_by);
}

export function planDrafts(requests: DraftRequest[], existing: ExistingProduct[]): PlanGroup[] {
  const groups = new Map<string, DraftRequest[]>();
  for (const r of requests) {
    const k = requestKey(r);
    const g = groups.get(k);
    if (g) g.push(r); else groups.set(k, [r]);
  }
  const byName = new Map<string, ExistingProduct[]>();
  for (const p of existing) {
    const k = tokenKey(nameTokens(p.name));
    const a = byName.get(k);
    if (a) a.push(p); else byName.set(k, [p]);
  }
  return [...groups].map(([key, rs]): PlanGroup => {
    const first = rs[0];
    if (!rowTokens(identity(first)).length) return { key, requests: rs, action: 'skip', reason: 'The item name is missing' };
    const fits = (byName.get(tokenKey(rowTokens(identity(first)))) ?? []).filter((p) => fitsExisting(first, p));
    if (fits.length > 1) {
      return { key, requests: rs, action: 'skip', reason: `Looks like ${fits.length} products already in the catalogue: link it by hand` };
    }
    if (fits.length === 1) {
      const product = fits[0];
      if (product.drug_schedule === 'Schedule X' || product.drug_schedule === 'NDPS') {
        return { key, requests: rs, action: 'skip', reason: `Matches ${product.name}, which can never be sold online (C-10): close the request` };
      }
      return { key, requests: rs, action: 'existing', product };
    }
    const lead = rs.find((r) => r.mrp_paise != null && r.mrp_paise > 0);
    if (!lead) return { key, requests: rs, action: 'skip', reason: 'The MRP is missing in the partner\'s file: add this one from Products → New' };
    return { key, requests: rs, action: 'create', lead };
  });
}
