// Drug licences of every party (Sprint 30) — the forms, labels and early checks the
// screens use. The server (backend services/licences/forms.ts) repeats every rule and is
// the authority; nothing here is stored on the device.
//   Form 20 / 21 retail · 20A / 21A restricted · 20B / 21B wholesale · 20C / 20D homoeopathic
//   20F / 20G Schedule X · 25 / 28 manufacture · 25A / 28A loan · 25B repacking · Other (named)

export const LICENCE_FORMS = [
  'dl20', 'dl21', 'dl20b', 'dl21b', 'dl25', 'dl28', 'dl25a', 'dl28a', 'dl25b',
  'dl20a', 'dl21a', 'dl20c', 'dl20d', 'dl20f', 'dl20g', 'other',
] as const;
export type LicenceForm = (typeof LICENCE_FORMS)[number];

export const FORM_INFO: Record<LicenceForm, { label: string; hint: string; group: string }> = {
  dl20: { label: 'Form 20', hint: 'Retail sale', group: 'Retail' },
  dl21: { label: 'Form 21', hint: 'Retail — Schedule C / C1 medicines', group: 'Retail' },
  dl20a: { label: 'Form 20A', hint: 'Restricted retail licence', group: 'Retail' },
  dl21a: { label: 'Form 21A', hint: 'Restricted retail — Schedule C / C1', group: 'Retail' },
  dl20b: { label: 'Form 20B', hint: 'Wholesale', group: 'Wholesale' },
  dl21b: { label: 'Form 21B', hint: 'Wholesale — Schedule C / C1 medicines', group: 'Wholesale' },
  dl25: { label: 'Form 25', hint: 'Manufacture for sale', group: 'Manufacture' },
  dl28: { label: 'Form 28', hint: 'Manufacture — Schedule C / C1', group: 'Manufacture' },
  dl25a: { label: 'Form 25A', hint: 'Loan licence to manufacture', group: 'Manufacture' },
  dl28a: { label: 'Form 28A', hint: 'Loan licence — Schedule C / C1', group: 'Manufacture' },
  dl25b: { label: 'Form 25B', hint: 'Repacking licence', group: 'Manufacture' },
  dl20c: { label: 'Form 20C', hint: 'Homoeopathic — retail', group: 'Other forms' },
  dl20d: { label: 'Form 20D', hint: 'Homoeopathic — wholesale', group: 'Other forms' },
  dl20f: { label: 'Form 20F', hint: 'Schedule X — retail (never sold online)', group: 'Other forms' },
  dl20g: { label: 'Form 20G', hint: 'Schedule X — wholesale (never sold online)', group: 'Other forms' },
  other: { label: 'Other licence', hint: 'Type the name of the form', group: 'Other forms' },
};

export const formLabel = (form: string, formName?: string | null) =>
  form === 'other' ? (formName?.trim() || 'Other licence') : (FORM_INFO[form as LicenceForm]?.label ?? form);

export type Party = 'partner' | 'supplier' | 'retailer' | 'wholesaler' | 'doctor';

/** What each party must hold at least one of (mirrors the server; plain wording). */
export const REQUIRED: Record<Party, { forms: LicenceForm[]; message: string } | null> = {
  partner: { forms: ['dl20', 'dl21', 'dl20b', 'dl21b'], message: 'A partner pharmacy needs a retail (Form 20 / 21) or wholesale (Form 20B / 21B) drug licence' },
  supplier: { forms: ['dl20b', 'dl21b', 'dl25', 'dl25a', 'dl25b', 'dl28', 'dl28a'], message: 'A supplier needs a wholesale (Form 20B / 21B) or manufacturing (Form 25 / 28) drug licence' },
  retailer: { forms: ['dl20', 'dl21'], message: 'A retail pharmacy account needs a retail drug licence (Form 20 or 21)' },
  wholesaler: { forms: ['dl20b', 'dl21b'], message: 'A wholesale account needs a wholesale drug licence (Form 20B or 21B)' },
  doctor: null,
};

/** One editable row on a form. Dates are YYYY-MM-DD strings ('' = not entered). */
export interface LicenceDraft {
  key: string;            // React key only
  form: LicenceForm | '';
  form_name: string;
  licence_number: string;
  issued_by: string;
  valid_from: string;
  valid_upto: string;
}

let seq = 0;
export const blankLicence = (form: LicenceForm | '' = ''): LicenceDraft => ({
  key: `l${Date.now()}-${seq++}`, form, form_name: '', licence_number: '', issued_by: '', valid_from: '', valid_upto: '',
});

/** A licence as the API returns it. */
export interface LicenceView {
  id: string | null;
  form: string;
  form_name: string | null;
  label: string;
  licence_number: string;
  issued_by: string | null;
  valid_from: string | null;
  valid_upto: string | null;
  status: 'pending' | 'verified' | 'rejected' | 'superseded';
  validity: 'valid' | 'expiring' | 'expired' | 'no_date';
  rejection_reason: string | null;
  has_document: boolean;
  verified_at?: string | null;
}

export const draftFromView = (l: LicenceView): LicenceDraft => ({
  ...blankLicence(l.form as LicenceForm), form_name: l.form_name ?? '', licence_number: l.licence_number,
  issued_by: l.issued_by ?? '', valid_from: l.valid_from ?? '', valid_upto: l.valid_upto ?? '',
});

export interface LicenceBody {
  form: LicenceForm;
  form_name: string | null;
  licence_number: string;
  issued_by: string | null;
  valid_from: string | null;
  valid_upto: string | null;
}

/** Rows that were started (a form or a number) → API body. Empty rows are ignored. */
export function licenceBodies(rows: LicenceDraft[]): LicenceBody[] {
  return rows.filter((r) => r.form || r.licence_number.trim()).map((r) => ({
    form: (r.form || 'other') as LicenceForm,
    form_name: r.form === 'other' ? r.form_name.trim() || null : null,
    licence_number: r.licence_number.trim(),
    issued_by: r.issued_by.trim() || null,
    valid_from: r.valid_from || null,
    valid_upto: r.valid_upto || null,
  }));
}

/** Early, plain checks before sending (the server repeats them). */
export function licenceProblems(rows: LicenceDraft[], o: { party: Party; today: string; requireValidUpto: boolean; partial?: boolean }): string[] {
  const started = rows.filter((r) => r.form || r.licence_number.trim());
  const need = o.partial ? null : REQUIRED[o.party];
  if (!started.length) return need ? [`Enter at least one drug licence. ${need.message}`] : o.partial ? ['Enter the licence'] : [];
  const p: string[] = [];
  const seen = new Set<string>();
  started.forEach((r, i) => {
    if (!r.form) { p.push(`Licence ${i + 1}: choose the licence form`); return; }
    const label = formLabel(r.form, r.form_name);
    if (r.form === 'other' && r.form_name.trim().length < 2) p.push(`Licence ${i + 1}: type the name of the licence form`);
    const k = r.form === 'other' ? `other:${r.form_name.trim().toUpperCase()}` : r.form;
    if (seen.has(k)) p.push(`${label} is entered twice — enter each licence form once`);
    seen.add(k);
    if (r.licence_number.replace(/[^A-Za-z0-9]/g, '').length < 3) p.push(`${label}: enter the licence number`);
    if (!r.valid_upto && o.requireValidUpto) p.push(`${label}: enter the valid-till date`);
    else if (r.valid_upto && r.valid_upto < o.today) p.push(`${label} expired on ${r.valid_upto} — enter the renewed licence`);
    if (r.valid_from && r.valid_upto && r.valid_from > r.valid_upto) p.push(`${label}: valid-from is after valid-till`);
  });
  if (need && !started.some((r) => r.form && need.forms.includes(r.form))) p.push(need.message);
  return p;
}

const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 864e5).toISOString().slice(0, 10);
export const EXPIRING_DAYS = 30;

/** Valid, expiring (≤ 30 days), expired or no date — for a date typed on a form. */
export function validityOf(validUpto: string | null | undefined, today: string): LicenceView['validity'] {
  if (!validUpto) return 'no_date';
  if (validUpto < today) return 'expired';
  if (validUpto <= addDays(today, EXPIRING_DAYS)) return 'expiring';
  return 'valid';
}

/** Licence count, earliest valid-till and warning, as admin lists get them from the API. */
export interface LicenceBadgeData {
  licence_count: number;
  pending_count: number;
  earliest_expiry: string | null;
  expiry_warning: 'expired' | 'expiring' | null;
}
