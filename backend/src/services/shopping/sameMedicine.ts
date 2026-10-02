// Is another product the same medicine? Used only to SUGGEST a cheaper option in
// the cart (Sprint 25); never to swap anything. Pure, unit-tested in
// sameMedicine.test.ts. Deliberately conservative — a product is "the same" only
// when ALL of these match:
//   • generic (salt) name, ignoring case and punctuation;
//   • every strength number in the name (650 = 650 mg; "500 mg + 125 mg" both);
//   • dosage form (tablet / capsule / liquid / …) and release type (SR, ER, gastro-
//     resistant, chewable, …) — these change how the medicine works;
//   • drug schedule, and the pack (net quantity) when both products state one, so
//     the price compared is for the same amount.
// Anything without a generic name or a strength in its name gets no suggestion.
// The buyer is told to ask the pharmacist if unsure; the pharmacist still checks
// every prescription line before dispatch (C-08).

export interface MedicineFacts {
  name: string;
  generic_name: string | null;
  drug_schedule: string | null;
  net_quantity?: string | null;
}

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9.%]+/g, ' ').trim().replace(/\s+/g, ' ');

/** Must equal the SQL in cheaperOption.service.ts: lower, non-alphanumerics → one space, trimmed. */
export function normaliseGeneric(g: string | null | undefined): string {
  return (g ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Strength numbers in the name, sorted ("60,000 IU" → 60000; "250 mg/5 ml" → 5, 250). */
export function strengthNumbers(name: string): string[] {
  const nums = (name.replace(/(\d),(\d{3})/g, '$1$2').match(/\d+(?:\.\d+)?/g) ?? [])
    .map((n) => String(Number(n)));
  return nums.sort((a, b) => Number(a) - Number(b));
}

const FORMS: [string, RegExp][] = [
  ['tablet', /\b(tab|tabs|tablet|tablets)\b/],
  ['capsule', /\b(cap|caps|capsule|capsules)\b/],
  ['liquid', /\b(syp|syr|syrup|suspension|susp|liquid|solution|drops?)\b/],
  ['injection', /\b(inj|injection|vial|ampoule)\b/],
  ['topical', /\b(cream|ointment|oint|gel|lotion)\b/],
  ['powder', /\b(powder|sachet|granules)\b/],
];

export function dosageForm(name: string): string {
  const n = name.toLowerCase();
  for (const [form, re] of FORMS) if (re.test(n)) return form;
  return 'other';
}

const RELEASE: [string, RegExp][] = [
  ['modified', /\b(sr|er|xr|cr|mr|xl|pr|extended[- ]release|sustained[- ]release|prolonged[- ]release|controlled[- ]release)\b/],
  ['gastro', /\b(ec|enteric[- ]coated|gastro[- ]resistant|dr|delayed[- ]release)\b/],
  ['dispersible', /\b(dt|dispersible|mouth[- ]dissolving|md|odt)\b/],
  ['chewable', /\b(chewable)\b/],
];

export function releaseType(name: string): string {
  const n = name.toLowerCase();
  return RELEASE.filter(([, re]) => re.test(n)).map(([k]) => k).join('+') || 'plain';
}

const pack = (q: string | null | undefined) => words(q ?? '');

/** A key equal for two products only when they are the same medicine; null = never suggest. */
export function medicineKey(m: MedicineFacts): string | null {
  const generic = normaliseGeneric(m.generic_name);
  const strengths = strengthNumbers(m.name);
  if (!generic || !strengths.length) return null;
  return [generic, strengths.join(','), dosageForm(m.name), releaseType(m.name), m.drug_schedule ?? ''].join('|');
}

export function isSameMedicine(a: MedicineFacts, b: MedicineFacts): boolean {
  const ka = medicineKey(a);
  if (!ka || ka !== medicineKey(b)) return false;
  // Same pack when both say what is in it; otherwise the prices are not comparable
  const pa = pack(a.net_quantity);
  const pb = pack(b.net_quantity);
  return !pa || !pb || pa === pb;
}

export interface PricedOption<T> { product: T; price_paise: number }

/** The cheapest in-stock option that is the same medicine and costs less; null if none. */
export function cheapestSame<T extends MedicineFacts & { id: string; in_stock: boolean }>(
  line: MedicineFacts & { id: string; price_paise: number },
  candidates: PricedOption<T>[],
): PricedOption<T> | null {
  let best: PricedOption<T> | null = null;
  for (const c of candidates) {
    if (c.product.id === line.id || !c.product.in_stock) continue;
    if (!(c.price_paise < line.price_paise)) continue;
    if (!isSameMedicine(line, c.product)) continue;
    if (!best || c.price_paise < best.price_paise) best = c;
  }
  return best;
}
