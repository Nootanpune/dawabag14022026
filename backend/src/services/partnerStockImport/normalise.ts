// Name, strength, pack and company normalisation for matching a partner's item to
// a Dawabag product. Deliberately strict: look-alike drug names are a patient
// safety risk, so only names with the same words and the same strengths match
// automatically; anything else goes to the partner to confirm. Pure: unit-tested.

// Dosage-form spellings → one word
const FORMS: Record<string, string> = {
  tab: 'tablet', tabs: 'tablet', tablet: 'tablet', tablets: 'tablet', tb: 'tablet', tabl: 'tablet',
  cap: 'capsule', caps: 'capsule', capsule: 'capsule', capsules: 'capsule',
  syp: 'syrup', syr: 'syrup', syrup: 'syrup',
  susp: 'suspension', suspension: 'suspension', sus: 'suspension',
  inj: 'injection', injection: 'injection', injn: 'injection',
  oint: 'ointment', ointment: 'ointment', ont: 'ointment',
  crm: 'cream', cream: 'cream',
  gel: 'gel', lotion: 'lotion', lot: 'lotion',
  drop: 'drops', drops: 'drops', drp: 'drops', drps: 'drops',
  sach: 'sachet', sachet: 'sachet', sachets: 'sachet', sac: 'sachet',
  sol: 'solution', soln: 'solution', solution: 'solution',
  pwd: 'powder', powder: 'powder', pow: 'powder',
  vial: 'vial', vials: 'vial', amp: 'ampoule', ampoule: 'ampoule', amps: 'ampoule',
  pfs: 'prefilled syringe',
};
export const FORM_WORDS = new Set(Object.values(FORMS).flatMap((f) => f.split(' ')));

// Words that never tell two medicines apart
const STOPWORDS = new Set(['ip', 'bp', 'usp', 'oral', 'the', 'of', 'and', 'with', 'for', 'film', 'coated', 'uncoated', 'pack', 'strip', 'new']);

const UNITS: Record<string, string> = {
  mg: 'mg', mgs: 'mg', mcg: 'mcg', ug: 'mcg', g: 'g', gm: 'g', gms: 'g', gram: 'g', grams: 'g', kg: 'kg',
  ml: 'ml', mls: 'ml', l: 'l', ltr: 'l', iu: 'iu', u: 'iu', '%': '%',
};

const base = (s: unknown) => String(s ?? '').toLowerCase().normalize('NFKC');

/** Pack-count tokens ("15's", "1x15", "10 tab" at the end) removed from names. */
const PACK_PATTERNS = [/\b\d+\s*[x*]\s*\d+(\s*(?:'?s|tab|tabs|cap|caps|ml|gm|g))?\b/g, /\b\d+\s*'\s*s\b/g, /\b\d+s\b/g];

/** Lower-case words with strengths joined to their unit ("500 MG" → "500mg"), forms unified. */
export function nameTokens(name: unknown): string[] {
  let s = base(name);
  for (const p of PACK_PATTERNS) s = s.replace(p, ' ');
  s = s.replace(/(\d)\s*%/g, '$1% ').replace(/[^a-z0-9.%/]+/g, ' ').replace(/(?<!\d)\.|\.(?!\d)/g, ' ');
  // "500/125" (combination strengths) stays one token; "/"-separated words split
  s = s.replace(/(?<![\d])\/|\/(?![\d])/g, ' ');
  const raw = s.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    let t = raw[i];
    const joined = t.match(/^(\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)*)([a-z%]+)$/);
    if (joined && UNITS[joined[2]]) t = joined[1] + UNITS[joined[2]];
    else if (/^\d+(\.\d+)?(\/\d+(\.\d+)?)*$/.test(t) && raw[i + 1] && UNITS[raw[i + 1]]) { t += UNITS[raw[i + 1]]; i++; }
    if (FORMS[t]) t = FORMS[t];
    if (STOPWORDS.has(t)) continue;
    out.push(...t.split(' '));
  }
  return out;
}

const STRENGTH = /^\d+(\.\d+)?(\/\d+(\.\d+)?)*(mg|mcg|g|kg|ml|l|iu|%)$/;
export const strengthTokens = (tokens: string[]) => tokens.filter((t) => STRENGTH.test(t));

export interface Pack { count: number; unit: 'unit' | 'ml' | 'g' }

/** "10 TAB" / "15's" / "1x15" / "100 ML" / "15 tablets" / "21.8 g sachet" → count and unit; null if none. */
export function parsePack(text: unknown): Pack | null {
  const s = base(text).replace(/,/g, '').trim();
  if (!s) return null;
  let m = s.match(/(\d+)\s*[x*]\s*(\d+(?:\.\d+)?)\s*([a-z']*)/);
  if (m) return { count: Number(m[2]), unit: unitClass(m[3]) };
  m = s.match(/(\d+(?:\.\d+)?)\s*(ml|mls|l|ltr|g|gm|gms|gram|grams|kg)\b/);
  if (m) {
    const n = Number(m[1]);
    if (['l', 'ltr'].includes(m[2])) return { count: n * 1000, unit: 'ml' };
    if (m[2] === 'kg') return { count: n * 1000, unit: 'g' };
    return { count: n, unit: m[2].startsWith('m') ? 'ml' : 'g' };
  }
  m = s.match(/(\d+)\s*(?:'\s*s|s\b|tab|tabs|tablets?|cap|caps|capsules?|nos?\b|pcs|units?|sachets?|strips?|vials?|amps?|ampoules?)/);
  if (m) return { count: Number(m[1]), unit: 'unit' };
  m = s.match(/^(\d+)$/);
  return m ? { count: Number(m[1]), unit: 'unit' } : null;
}

function unitClass(u: string): Pack['unit'] {
  if (/^ml|^l/.test(u)) return 'ml';
  if (/^g|^kg/.test(u)) return 'g';
  return 'unit';
}

/** Same pack when both are known; unknown on either side is not a mismatch. */
export function packsAgree(a: Pack | null, b: Pack | null): boolean {
  if (!a || !b) return true;
  return a.unit === b.unit && Math.abs(a.count - b.count) < 0.001;
}

const makerWords = (s: unknown) => base(s).replace(/[^a-z0-9]+/g, ' ').split(' ')
  .filter((w) => w.length >= 3 && !['pvt', 'ltd', 'limited', 'private', 'pharma', 'pharmaceuticals', 'laboratories', 'labs', 'india', 'healthcare', 'the'].includes(w));

/**
 * Whether two company names can be the same maker. Billing software often keeps a
 * short code ("ZYD-C", "ABBOT", "TORRE"), so a word of one that starts the other's
 * word (≥ 3 letters) agrees. Unknown on either side is not a mismatch.
 */
export function makersAgree(a: unknown, b: unknown): boolean {
  const x = makerWords(a);
  const y = makerWords(b);
  if (!x.length || !y.length) return true;
  return x.some((p) => y.some((q) => q.startsWith(p) || p.startsWith(q)));
}

/** Order-free key of the meaningful words, for exact name matching. */
export const tokenKey = (tokens: string[]) => [...new Set(tokens)].sort().join(' ');

/**
 * The partner's identity for an item, used to remember links between imports:
 * its own item code when the file has one, else name + unit + company code
 * (MediVision exports have no item code).
 */
export function itemKey(p: { item_code?: string | null; item_name?: string | null; pack?: string | null; manufacturer?: string | null }): string | null {
  const code = String(p.item_code ?? '').trim().toUpperCase();
  if (code) return `code:${code}`.slice(0, 400);
  const clean = (v: unknown) => base(v).replace(/[^a-z0-9%.]+/g, ' ').trim().replace(/\s+/g, ' ');
  const name = clean(p.item_name);
  if (!name) return null;
  return `name:${name}|${clean(p.pack)}|${clean(p.manufacturer)}`.slice(0, 400);
}

/** Jaccard similarity of two token lists (for ranking suggestions only, never for matching). */
export function similarity(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  const inter = [...A].filter((t) => B.has(t)).length;
  const union = new Set([...A, ...B]).size;
  return union ? inter / union : 0;
}
