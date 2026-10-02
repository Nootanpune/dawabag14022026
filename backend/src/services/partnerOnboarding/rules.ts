// Pure rules for onboarding a marketplace partner (Sprint 28). No database here,
// so every rule is unit-tested (rules.test.ts) and the service only orchestrates.
//
// Drug licences (Drugs and Cosmetics Rules, 1945; owner decision 30 Sep 2026):
//   Form 20  / Form 21  — retail sale (21 covers Schedule C / C1 drugs)   → patients
//   Form 20B / Form 21B — wholesale                                        → trade buyers
// A partner may hold any of the four; each has its own number and valid-till date
// (C-02, C-07). A licence already past its date is refused (C-33).
export const LICENCE_FORMS = ['dl20', 'dl21', 'dl20b', 'dl21b'] as const;
export type LicenceForm = typeof LICENCE_FORMS[number];

export const LICENCE_LABEL: Record<LicenceForm, string> = {
  dl20: 'Form 20 (retail)', dl21: 'Form 21 (retail)', dl20b: 'Form 20B (wholesale)', dl21b: 'Form 21B (wholesale)',
};
const RETAIL: LicenceForm[] = ['dl20', 'dl21'];
const WHOLESALE: LicenceForm[] = ['dl20b', 'dl21b'];

export interface LicenceIn { licence_type: LicenceForm; licence_number: string; valid_upto: string }
export interface PharmacistIn { full_name: string; registration_no: string }

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isRealDate = (s: string) => DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))
  && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** Plain reasons the licences cannot be accepted (empty = fine). `today` is the IST date. */
export function licenceProblems(licences: LicenceIn[], today: string): string[] {
  const problems: string[] = [];
  if (!licences.length) return ['Enter at least one drug licence (Form 20, 21, 20B or 21B)'];
  const seen = new Set<string>();
  for (const l of licences) {
    const label = LICENCE_LABEL[l.licence_type] ?? l.licence_type;
    if (!LICENCE_FORMS.includes(l.licence_type)) { problems.push(`${l.licence_type} is not a drug licence form we accept`); continue; }
    if (seen.has(l.licence_type)) problems.push(`${label} is entered twice — a partner holds one licence of each form`);
    seen.add(l.licence_type);
    const number = (l.licence_number ?? '').trim();
    if (number.length < 3) problems.push(`${label}: enter the licence number`);
    if (!isRealDate(l.valid_upto)) problems.push(`${label}: enter the valid-till date`);
    else if (l.valid_upto < today) problems.push(`${label} licence ${number} expired on ${l.valid_upto} — ask the partner for the renewed licence`);
  }
  return problems;
}

/**
 * The single licence summary kept on vendors (drug_license_no / _type / _expiry),
 * which every existing seller check reads (assertPartnerCanSell, allocation,
 * partner stock): the first of 20, 21, 20B, 21B as the licence number and the
 * EARLIEST valid-till date, so the partner stops selling as soon as any of its
 * licences lapses until the renewal is entered (conservative, C-33).
 */
export function licenceSummary(licences: LicenceIn[]) {
  const sorted = [...licences].sort((a, b) => LICENCE_FORMS.indexOf(a.licence_type) - LICENCE_FORMS.indexOf(b.licence_type));
  const primary = sorted[0];
  const earliest = licences.map((l) => l.valid_upto).sort()[0];
  return { drug_license_no: primary.licence_number.trim(), drug_license_type: primary.licence_type, drug_license_expiry: earliest };
}

/**
 * Who the partner's licences let it sell to. Retail (20/21) → patients and other
 * retail buyers; wholesale (20B/21B) → licensed trade buyers. Only licences still
 * in date count.
 */
export function sellingRights(licences: Pick<LicenceIn, 'licence_type' | 'valid_upto'>[], today: string) {
  const live = licences.filter((l) => l.valid_upto >= today).map((l) => l.licence_type);
  return { retail: live.some((t) => RETAIL.includes(t)), wholesale: live.some((t) => WHOLESALE.includes(t)) };
}

/** Plain reasons the pharmacists cannot be accepted (empty = fine). At least one is required (C-03). */
export function pharmacistProblems(pharmacists: PharmacistIn[]): string[] {
  if (!pharmacists.length) return ['Enter at least one registered pharmacist'];
  const problems: string[] = [];
  const seen = new Set<string>();
  pharmacists.forEach((p, i) => {
    const name = (p.full_name ?? '').trim();
    const reg = (p.registration_no ?? '').trim().toUpperCase();
    if (name.length < 2) problems.push(`Pharmacist ${i + 1}: enter the full name`);
    if (reg.length < 2) problems.push(`Pharmacist ${i + 1}: enter the State Pharmacy Council registration number`);
    if (reg && seen.has(reg)) problems.push(`Pharmacist registration ${reg} is entered twice`);
    seen.add(reg);
  });
  return problems;
}

const RESERVED_PREFIXES = ['DWB', 'DWS'];
/**
 * The partner's own invoice series. <prefix>C/2627/00001 must fit the 16-character
 * invoice number limit (CGST Rule 46, IRP), so 2–4 capitals/digits, not starting
 * with 0; DWB and DWS are Dawabag's own (C-32).
 */
export function invoicePrefixProblem(prefix: string): string | null {
  if (!/^[A-Z1-9][A-Z0-9]{1,3}$/.test(prefix)) return 'Invoice prefix must be 2–4 capital letters or digits, not starting with 0';
  if (RESERVED_PREFIXES.includes(prefix)) return `${prefix} is reserved for Dawabag`;
  return null;
}
