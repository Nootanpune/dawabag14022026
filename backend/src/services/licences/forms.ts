// Drug licence forms and the pure rules every party shares (Sprint 30). No database
// here, so every rule is unit-tested (forms.test.ts); register.service orchestrates.
//
// Drugs and Cosmetics Rules, 1945 — licence forms a party may hold:
//   Form 20 / 21     retail sale (21: Schedule C and C1 drugs)
//   Form 20A / 21A   restricted retail licence
//   Form 20B / 21B   wholesale (owner decision 30 Sep 2026: wholesale is 20B / 21B)
//   Form 20C / 20D   homoeopathic medicines, retail / wholesale
//   Form 20F / 20G   Schedule X drugs, retail / wholesale (never sold online, C-10)
//   Form 25 / 28     manufacture for sale (28: Schedule C and C1)
//   Form 25A / 28A   loan licence to manufacture        Form 25B  repacking
//   Other            any other form, named by the user (free text) — we do not guess
// Rules used: C-02 licensed suppliers, C-07 licence numbers and validity on record,
// C-11 B2B buyer KYC, C-13 licences on B2B invoices, C-14 expiry blocks trade buying,
// C-33 partner selling eligibility.
export const LICENCE_FORMS = [
  'dl20', 'dl21', 'dl20a', 'dl21a', 'dl20b', 'dl21b', 'dl20c', 'dl20d', 'dl20f', 'dl20g',
  'dl25', 'dl25a', 'dl25b', 'dl28', 'dl28a', 'other',
] as const;
export type LicenceForm = typeof LICENCE_FORMS[number];

export type LicenceKind = 'retail' | 'restricted' | 'wholesale' | 'homoeopathic' | 'schedule_x' | 'manufacture' | 'other';

interface FormInfo { label: string; kind: LicenceKind; hint: string }
export const FORM_INFO: Record<LicenceForm, FormInfo> = {
  dl20: { label: 'Form 20', kind: 'retail', hint: 'Retail sale' },
  dl21: { label: 'Form 21', kind: 'retail', hint: 'Retail sale — Schedule C / C1 medicines' },
  dl20a: { label: 'Form 20A', kind: 'restricted', hint: 'Restricted retail licence' },
  dl21a: { label: 'Form 21A', kind: 'restricted', hint: 'Restricted retail licence — Schedule C / C1' },
  dl20b: { label: 'Form 20B', kind: 'wholesale', hint: 'Wholesale' },
  dl21b: { label: 'Form 21B', kind: 'wholesale', hint: 'Wholesale — Schedule C / C1 medicines' },
  dl20c: { label: 'Form 20C', kind: 'homoeopathic', hint: 'Homoeopathic medicines — retail' },
  dl20d: { label: 'Form 20D', kind: 'homoeopathic', hint: 'Homoeopathic medicines — wholesale' },
  dl20f: { label: 'Form 20F', kind: 'schedule_x', hint: 'Schedule X — retail (never sold online)' },
  dl20g: { label: 'Form 20G', kind: 'schedule_x', hint: 'Schedule X — wholesale (never sold online)' },
  dl25: { label: 'Form 25', kind: 'manufacture', hint: 'Manufacture for sale' },
  dl25a: { label: 'Form 25A', kind: 'manufacture', hint: 'Loan licence to manufacture' },
  dl25b: { label: 'Form 25B', kind: 'manufacture', hint: 'Repacking licence' },
  dl28: { label: 'Form 28', kind: 'manufacture', hint: 'Manufacture — Schedule C / C1 medicines' },
  dl28a: { label: 'Form 28A', kind: 'manufacture', hint: 'Loan licence — Schedule C / C1 medicines' },
  other: { label: 'Other licence', kind: 'other', hint: 'Any other form — type its name' },
};

/** Order in which licences are listed and the "first" (summary) number is chosen. */
export const FORM_ORDER: LicenceForm[] = [
  'dl20', 'dl21', 'dl20b', 'dl21b', 'dl25', 'dl28', 'dl25a', 'dl28a', 'dl25b',
  'dl20a', 'dl21a', 'dl20c', 'dl20d', 'dl20f', 'dl20g', 'other',
];

export const isLicenceForm = (v: unknown): v is LicenceForm => typeof v === 'string' && (LICENCE_FORMS as readonly string[]).includes(v);

/**
 * The form as people write it → our code. Accepts "20", "Form 21B", "20-B", "dl20b",
 * the KYC API's "DL-20B" and Dawabag's register types "retail_20" / "wholesale_21b".
 * Returns null for anything else (the caller then asks for "Other" with a name).
 */
export function normaliseForm(v: unknown): LicenceForm | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase()
    .replace(/^(retail|wholesale|restricted|schedule_x|homoeopathic|manufacturing)_/, '')
    .replace(/^form\s*(no\.?)?\s*/, '').replace(/^dl[\s-]*/, '').replace(/[\s_-]+/g, '');
  if (s === 'other') return 'other';
  const code = `dl${s}`;
  return isLicenceForm(code) ? code : null;
}

/** Form label for people: "Form 20B", or the typed name for "other". */
export const formLabel = (form: string, formName?: string | null) =>
  form === 'other' ? (formName?.trim() || 'Other licence') : (FORM_INFO[form as LicenceForm]?.label ?? form);

/** The same number however it is typed (spaces, dashes, slashes, case) — matches the DB number_key. */
export const numberKey = (n: string) => (n ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

export type Party = 'partner' | 'supplier' | 'retailer' | 'wholesaler' | 'doctor';

export interface LicenceIn {
  form: LicenceForm;
  form_name?: string | null;
  licence_number: string;
  issued_by?: string | null;
  valid_from?: string | null;
  valid_upto?: string | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const isRealDate = (s: unknown): s is string => typeof s === 'string' && DATE.test(s)
  && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

const RETAIL: LicenceForm[] = ['dl20', 'dl21'];
const WHOLESALE: LicenceForm[] = ['dl20b', 'dl21b'];
const MANUFACTURE: LicenceForm[] = ['dl25', 'dl25a', 'dl25b', 'dl28', 'dl28a'];

/** What a party must hold at least one of, and how to say it. */
export const REQUIRED: Record<Party, { forms: LicenceForm[]; message: string } | null> = {
  partner: { forms: [...RETAIL, ...WHOLESALE], message: 'A partner pharmacy needs a retail (Form 20 / 21) or wholesale (Form 20B / 21B) drug licence' },
  supplier: { forms: [...WHOLESALE, ...MANUFACTURE], message: 'A supplier needs a wholesale (Form 20B / 21B) or manufacturing (Form 25 / 28) drug licence' },
  retailer: { forms: RETAIL, message: 'A retail pharmacy account needs a retail drug licence (Form 20 or 21)' },
  wholesaler: { forms: WHOLESALE, message: 'A wholesale account needs a wholesale drug licence (Form 20B or 21B)' },
  doctor: null,   // a doctor or hospital may add licences (e.g. a hospital pharmacy) but needs none to register
};

export interface ProblemOptions {
  party: Party;
  today: string;                 // IST date
  requireValidUpto: boolean;     // admins entering a checked licence; buyers may leave it for the admin
  allowExpired?: boolean;        // never for new entries; kept for display-only checks
  partial?: boolean;             // a renewal or an extra licence: the party's other licences stay as they are
}

/** Plain reasons the licences cannot be accepted (empty = fine). */
export function licenceProblems(licences: LicenceIn[], o: ProblemOptions): string[] {
  const problems: string[] = [];
  const need = o.partial ? null : REQUIRED[o.party];
  if (!licences.length) return need ? [`Enter at least one drug licence. ${need.message}`] : o.partial ? ['Enter the licence'] : [];
  const seenForm = new Set<string>();
  licences.forEach((l, i) => {
    if (!isLicenceForm(l.form)) { problems.push(`Licence ${i + 1}: choose the licence form`); return; }
    const label = formLabel(l.form, l.form_name);
    const formName = (l.form_name ?? '').trim();
    if (l.form === 'other' && formName.length < 2) problems.push(`Licence ${i + 1}: type the name of the licence form`);
    const formKey = l.form === 'other' ? `other:${formName.toUpperCase()}` : l.form;
    if (seenForm.has(formKey)) problems.push(`${label} is entered twice — enter each licence form once`);
    seenForm.add(formKey);
    const number = (l.licence_number ?? '').trim();
    if (numberKey(number).length < 3) problems.push(`${label}: enter the licence number`);
    // (The same number may appear on two forms of ONE party — some states print one number for 20 and 21)
    else if (number.length > 100) problems.push(`${label}: the licence number is too long`);
    if (l.valid_upto != null && l.valid_upto !== '' && !isRealDate(l.valid_upto)) problems.push(`${label}: enter the valid-till date as a real date`);
    else if (!l.valid_upto && o.requireValidUpto) problems.push(`${label}: enter the valid-till date`);
    else if (l.valid_upto && l.valid_upto < o.today && !o.allowExpired) {
      problems.push(`${label} licence ${number} expired on ${l.valid_upto} — enter the renewed licence`);
    }
    if (l.valid_from && !isRealDate(l.valid_from)) problems.push(`${label}: enter the valid-from date as a real date`);
    else if (l.valid_from && l.valid_upto && l.valid_from > l.valid_upto) problems.push(`${label}: valid-from is after valid-till`);
    else if (l.valid_from && l.valid_from > o.today) problems.push(`${label}: valid-from cannot be in the future`);
  });
  if (need && !licences.some((l) => need.forms.includes(l.form))) problems.push(need.message);
  return problems;
}

export type Validity = 'valid' | 'expiring' | 'expired' | 'no_date';
export const EXPIRING_DAYS = 30;

const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 864e5).toISOString().slice(0, 10);

/** Valid, expiring (≤ 30 days left), expired, or no date on file. */
export function validity(validUpto: string | null | undefined, today: string): Validity {
  if (!validUpto) return 'no_date';
  if (validUpto < today) return 'expired';
  if (validUpto <= addDays(today, EXPIRING_DAYS)) return 'expiring';
  return 'valid';
}

export interface HeldLicence { form: LicenceForm | string; valid_upto: string | null; status?: string }

/**
 * The single summary kept on vendors / users (drug_license_no|number, _type, _expiry)
 * that every existing check reads — the database trigger refresh_licence_summary does
 * the same: first CHECKED form in FORM_ORDER and the EARLIEST valid-till, so a party
 * whose any licence lapses is stopped until the renewal is verified (C-14, C-33, C-02).
 */
export function licenceSummary<T extends HeldLicence & { licence_number: string }>(licences: T[]) {
  const checked = licences.filter((l) => (l.status ?? 'verified') === 'verified');
  if (!checked.length) return null;
  const rank = (f: string) => { const i = FORM_ORDER.indexOf(f as LicenceForm); return i < 0 ? 99 : i; };
  const first = [...checked].sort((a, b) => rank(a.form) - rank(b.form))[0];
  const dates = checked.map((l) => l.valid_upto).filter((d): d is string => !!d).sort();
  return { number: first.licence_number.trim(), form: first.form, expiry: dates[0] ?? null };
}

/** What the checked, in-date licences allow. Expired or unchecked licences give no right. */
export function licenceRights(licences: HeldLicence[], today: string) {
  const live = licences.filter((l) => (l.status ?? 'verified') === 'verified' && !!l.valid_upto && l.valid_upto >= today)
    .map((l) => l.form as LicenceForm);
  return {
    retail: live.some((f) => RETAIL.includes(f)),
    wholesale: live.some((f) => WHOLESALE.includes(f)),
    manufacture: live.some((f) => MANUFACTURE.includes(f)),
  };
}

export interface Eligibility {
  ok: boolean;
  reasons: string[];       // why the party may not trade now (expired licences first, then a missing kind)
  expired: string[];       // just the lapsed licences
  missingKind: boolean;    // no checked, in-date licence of the kind the party needs
  warnings: string[];      // ending within 30 days
}

/**
 * Whether the party may do its business now, from ALL its licences:
 *   - every checked licence must be in date (any lapsed one blocks, C-14 / C-33 / C-02);
 *   - at least one checked, in-date licence of the kind the party needs.
 * Licences ending within 30 days are a warning, not a block.
 */
export function eligibility(licences: (HeldLicence & { licence_number?: string; form_name?: string | null })[], party: Party, today: string): Eligibility {
  const checked = licences.filter((l) => (l.status ?? 'verified') === 'verified');
  const reasons: string[] = [];
  const warnings: string[] = [];
  for (const l of checked) {
    const v = validity(l.valid_upto, today);
    const label = formLabel(l.form, l.form_name);
    if (v === 'expired') reasons.push(`${label} licence ${l.licence_number ?? ''} expired on ${l.valid_upto}`.replace('  ', ' '));
    if (v === 'expiring') warnings.push(`${label} licence ${l.licence_number ?? ''} expires on ${l.valid_upto}`.replace('  ', ' '));
  }
  const expired = [...reasons];
  const need = REQUIRED[party];
  const missingKind = !!need && !checked.some((l) => need.forms.includes(l.form as LicenceForm) && validity(l.valid_upto, today) !== 'expired');
  if (missingKind && !reasons.length) reasons.push(`${need!.message}, checked by Dawabag`);
  return { ok: reasons.length === 0, reasons, expired, missingKind, warnings };
}

/** "Form 20: MH-1 · Form 21B: MH-2" — every licence, for invoices and seller details. */
export function licenceLine(licences: { form: string; form_name?: string | null; licence_number: string }[]): string | null {
  const rank = (f: string) => { const i = FORM_ORDER.indexOf(f as LicenceForm); return i < 0 ? 99 : i; };
  const parts = [...licences].sort((a, b) => rank(a.form) - rank(b.form))
    .map((l) => `${formLabel(l.form, l.form_name)}: ${l.licence_number.trim()}`);
  return parts.length ? parts.join(' · ') : null;
}

/** Dawabag's own register types (business_licences, C-07) that are drug licences, with their form. */
export const DAWABAG_DRUG_TYPES: Record<string, LicenceForm> = {
  retail_20: 'dl20', retail_21: 'dl21', wholesale_20b: 'dl20b', wholesale_21b: 'dl21b',
  restricted_20a: 'dl20a', restricted_21a: 'dl21a', schedule_x_20f: 'dl20f', schedule_x_20g: 'dl20g',
};
