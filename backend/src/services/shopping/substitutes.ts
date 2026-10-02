// Substitutes on the product page (Sprint 33) — the pure part, unit-tested in
// substitutes.test.ts. A substitute is the SAME medicine from another maker:
// same generic name and every strength, dosage form, release type, route and
// schedule (sameMedicine.medicineKey) and a pack whose price can be compared per
// unit (tablets with tablets, ml with ml). It is only listed for the buyer to ask
// their doctor or pharmacist about — nothing is ever swapped automatically, and
// the pharmacist still checks every prescription line (C-08).
import { MedicineFacts, medicineKey } from './sameMedicine';

export type PackUnit = 'unit' | 'ml' | 'g';
export interface PackSize { count: number; unit: PackUnit; label: string }

const UNIT_WORDS: [RegExp, PackUnit, string][] = [
  [/^(tab|tabs|tablet|tablets)$/, 'unit', 'tablet'],
  [/^(cap|caps|capsule|capsules)$/, 'unit', 'capsule'],
  [/^(sachet|sachets)$/, 'unit', 'sachet'],
  [/^(vial|vials)$/, 'unit', 'vial'],
  [/^(amp|ampoule|ampoules|ampule|ampules)$/, 'unit', 'ampoule'],
  [/^(respule|respules|rotacap|rotacaps)$/, 'unit', 'dose'],
  [/^(unit|units|nos|no|pcs|pieces?)$/, 'unit', 'unit'],
  [/^(ml|mls|millilitre|millilitres|milliliter|milliliters)$/, 'ml', 'ml'],
  [/^(l|ltr|litre|litres|liter|liters)$/, 'ml', 'ml'],
  [/^(g|gm|gms|gram|grams)$/, 'g', 'g'],
  [/^(kg)$/, 'g', 'g'],
];

/**
 * What one pack holds, from the declared net quantity (C-17): "10 tablets",
 * "1 x 15 TAB", "Strip of 10 capsules", "100 ml", "1 L", "30 gm". null when it
 * cannot be read — such a pack is only compared with an identical pack text.
 */
export function packSize(netQuantity: string | null | undefined): PackSize | null {
  const s = (netQuantity ?? '').toLowerCase().replace(/,/g, '').trim();
  if (!s) return null;
  // "2 x 10 tablets" / "1x15 tab"
  const m = s.match(/(?:(\d+(?:\.\d+)?)\s*[x×*]\s*)?(\d+(?:\.\d+)?)\s*([a-z]+)/);
  if (!m) return null;
  const word = m[3];
  const found = UNIT_WORDS.find(([re]) => re.test(word));
  if (!found) return null;
  const [, unit, label] = found;
  let count = Number(m[2]) * (m[1] ? Number(m[1]) : 1);
  if (/^(l|ltr|litre|litres|liter|liters|kg)$/.test(word)) count *= 1000;
  if (!(count > 0)) return null;
  return { count, unit, label };
}

const packText = (q: string | null | undefined) => (q ?? '').toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim();

/** Two packs can be priced against each other: same unit kind, or the same stated pack. */
export function packComparable(a: string | null | undefined, b: string | null | undefined): boolean {
  const pa = packSize(a);
  const pb = packSize(b);
  if (pa && pb) return pa.unit === pb.unit;
  return packText(a) === packText(b);
}

/** Price of one tablet / ml / g (paise, unrounded); the pack price when the pack cannot be read. */
export function pricePerUnit(pricePaise: number, netQuantity: string | null | undefined): number {
  const p = packSize(netQuantity);
  return p ? pricePaise / p.count : pricePaise;
}

/** "per tablet" / "per ml" / "per pack" */
export function unitLabel(netQuantity: string | null | undefined): string {
  const p = packSize(netQuantity);
  return p ? `per ${p.label}` : 'per pack';
}

/** Whole-number saving against the current product, per unit; null when it is not cheaper. */
export function savePct(currentPerUnit: number, otherPerUnit: number): number | null {
  if (!(currentPerUnit > 0) || !(otherPerUnit < currentPerUnit)) return null;
  const pct = Math.floor(((currentPerUnit - otherPerUnit) / currentPerUnit) * 100);
  return pct >= 1 ? pct : null;
}

export interface SubstituteCandidate extends MedicineFacts {
  id: string;
  price_paise: number;
  in_stock: boolean;
}

export interface RankedSubstitute<T> { product: T; per_unit_paise: number; unit_label: string; save_pct: number | null }

/**
 * Every substitute for the current product, cheapest per unit first (then in
 * stock first, then name). The current product itself is never listed.
 */
export function rankSubstitutes<T extends SubstituteCandidate>(
  current: MedicineFacts & { id: string; price_paise: number },
  candidates: T[],
): RankedSubstitute<T>[] {
  const key = medicineKey(current);
  if (!key) return [];
  const currentPerUnit = pricePerUnit(current.price_paise, current.net_quantity);
  return candidates
    .filter((c) => c.id !== current.id && medicineKey(c) === key && packComparable(current.net_quantity, c.net_quantity))
    .map((c) => {
      const perUnit = pricePerUnit(c.price_paise, c.net_quantity);
      return { product: c, per_unit_paise: perUnit, unit_label: unitLabel(c.net_quantity), save_pct: savePct(currentPerUnit, perUnit) };
    })
    .sort((a, b) => a.per_unit_paise - b.per_unit_paise
      || Number(b.product.in_stock) - Number(a.product.in_stock)
      || a.product.name.localeCompare(b.product.name));
}

/** Shown with every substitutes list. */
export const SUBSTITUTE_NOTE = 'Same medicine, different maker. Ask your doctor or pharmacist before switching.';
