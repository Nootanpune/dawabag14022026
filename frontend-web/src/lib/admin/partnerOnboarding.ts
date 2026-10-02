// Admin → Partners (Sprint 28): Dawabag's admin adds a partner pharmacy directly —
// business, GST, drug licences (Forms 20/21 retail, 20B/21B wholesale), registered
// pharmacists, address and portal logins with temporary passwords. Server:
// POST/GET/PUT /admin/partners, POST /admin/partners/:id/logins.
import api from '../api';

export type LicenceForm = 'dl20' | 'dl21' | 'dl20b' | 'dl21b';
export const LICENCE_FORMS: { form: LicenceForm; label: string; hint: string }[] = [
  { form: 'dl20', label: 'Form 20', hint: 'Retail — sale to patients' },
  { form: 'dl21', label: 'Form 21', hint: 'Retail — Schedule C / C1 medicines' },
  { form: 'dl20b', label: 'Form 20B', hint: 'Wholesale — sale to licensed buyers' },
  { form: 'dl21b', label: 'Form 21B', hint: 'Wholesale — Schedule C / C1 medicines' },
];
export const licenceLabel = (t: string) => LICENCE_FORMS.find((l) => l.form === t)?.label ?? t;

export interface LicenceRow { held: boolean; number: string; valid_upto: string }
export interface PharmacistRow { full_name: string; registration_no: string }
export interface LoginRow { mobile: string; full_name: string; temporary_password: string }

export interface PartnerFormValues {
  legal_name: string;
  trade_name: string;
  gstin: string;
  contact_name: string;
  contact_mobile: string;
  contact_email: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  pincode: string;
  invoice_prefix: string;
  licences: Record<LicenceForm, LicenceRow>;
  pharmacists: PharmacistRow[];
  logins: LoginRow[];
}

const noLicence = (): LicenceRow => ({ held: false, number: '', valid_upto: '' });

export function blankPartnerForm(): PartnerFormValues {
  return {
    legal_name: '', trade_name: '', gstin: '', contact_name: '', contact_mobile: '', contact_email: '',
    address_line1: '', address_line2: '', city: '', state: 'Maharashtra', pincode: '', invoice_prefix: '',
    licences: { dl20: noLicence(), dl21: noLicence(), dl20b: noLicence(), dl21b: noLicence() },
    pharmacists: [{ full_name: '', registration_no: '' }],
    logins: [],
  };
}

export interface PartnerLicence { licence_type: LicenceForm; licence_number: string; valid_upto: string; status: 'valid' | 'expiring' | 'expired' }
export interface PartnerLogin { user_id: string; mobile: string; full_name: string | null; must_change_password: boolean; is_active: boolean; last_login_at: string | null }
export interface PartnerDetail {
  id: string;
  legal_name: string;
  trade_name: string | null;
  gstin: string | null;
  contact_name: string | null;
  contact_mobile: string | null;
  contact_email: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  invoice_prefix: string | null;
  approval_status: string;
  is_active: boolean;
  has_invoices: boolean;
  drug_license_expiry: string | null;
  licences: PartnerLicence[];
  pharmacists: PharmacistRow[];
  logins: PartnerLogin[];
  selling_rights: { retail: boolean; wholesale: boolean };
}
export interface PartnerListRow {
  id: string;
  name: string;
  trade_name: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  gst_number: string | null;
  invoice_prefix: string | null;
  approval_status: string;
  is_active: boolean;
  drug_license_expiry: string | null;
  licence_types: LicenceForm[];
  pharmacists: number;
  logins: { user_id: string; mobile: string }[] | null;
}

export function formFromDetail(d: PartnerDetail): PartnerFormValues {
  const f = blankPartnerForm();
  for (const l of d.licences) f.licences[l.licence_type] = { held: true, number: l.licence_number, valid_upto: l.valid_upto };
  return {
    ...f,
    legal_name: d.legal_name ?? '', trade_name: d.trade_name ?? '', gstin: d.gstin ?? '',
    contact_name: d.contact_name ?? '', contact_mobile: d.contact_mobile ?? '', contact_email: d.contact_email ?? '',
    address_line1: d.address_line1 ?? '', address_line2: d.address_line2 ?? '', city: d.city ?? '', state: d.state ?? '',
    pincode: d.pincode ?? '', invoice_prefix: d.invoice_prefix ?? '',
    pharmacists: d.pharmacists.length ? d.pharmacists.map((p) => ({ ...p })) : f.pharmacists,
  };
}

function detailsBody(v: PartnerFormValues) {
  const t = (s: string) => s.trim();
  return {
    legal_name: t(v.legal_name), trade_name: t(v.trade_name) || null, gstin: t(v.gstin).toUpperCase(),
    contact_name: t(v.contact_name), contact_mobile: t(v.contact_mobile), contact_email: t(v.contact_email) || null,
    address_line1: t(v.address_line1), address_line2: t(v.address_line2) || null, city: t(v.city), state: t(v.state),
    pincode: t(v.pincode), invoice_prefix: t(v.invoice_prefix).toUpperCase(),
    licences: LICENCE_FORMS.filter(({ form }) => v.licences[form].held).map(({ form }) => ({
      licence_type: form, licence_number: t(v.licences[form].number), valid_upto: v.licences[form].valid_upto,
    })),
    pharmacists: v.pharmacists.filter((p) => t(p.full_name) || t(p.registration_no))
      .map((p) => ({ full_name: t(p.full_name), registration_no: t(p.registration_no).toUpperCase() })),
  };
}

export const buildCreateBody = (v: PartnerFormValues) => ({
  ...detailsBody(v),
  logins: v.logins.map((l) => ({ mobile: l.mobile.trim(), full_name: l.full_name.trim() || null, temporary_password: l.temporary_password })),
});
export const buildUpdateBody = (v: PartnerFormValues) => detailsBody(v);

/** Early, plain checks before sending (the server repeats all of them). */
export function formProblems(v: PartnerFormValues, today: string, opts: { withLogins: boolean }): string[] {
  const p: string[] = [];
  const held = LICENCE_FORMS.filter(({ form }) => v.licences[form].held);
  if (!held.length) p.push('Tick at least one drug licence and enter its number and valid-till date');
  for (const { form, label } of held) {
    const l = v.licences[form];
    if (l.number.trim().length < 3) p.push(`${label}: enter the licence number`);
    if (!l.valid_upto) p.push(`${label}: enter the valid-till date`);
    else if (l.valid_upto < today) p.push(`${label} expired on ${l.valid_upto} — ask the partner for the renewed licence`);
  }
  if (!v.pharmacists.some((x) => x.full_name.trim() && x.registration_no.trim())) p.push('Enter at least one registered pharmacist');
  if (opts.withLogins) {
    if (!v.logins.length) p.push('Add at least one login (mobile number)');
    v.logins.forEach((l, i) => { if (!/^[6-9]\d{9}$/.test(l.mobile.trim())) p.push(`Login ${i + 1}: enter a 10-digit mobile number`); });
    const mobiles = v.logins.map((l) => l.mobile.trim());
    if (new Set(mobiles).size !== mobiles.length) p.push('The same login mobile is entered twice');
  }
  return p;
}

export const partnerKeys = {
  list: ['admin', 'partners', 'list'] as const,
  detail: (id: string) => ['admin', 'partners', 'detail', id] as const,
};

export async function fetchPartners(): Promise<PartnerListRow[]> {
  const { data } = await api.get('/admin/partners');
  return data.data?.partners ?? [];
}
export async function fetchPartner(id: string): Promise<PartnerDetail> {
  const { data } = await api.get(`/admin/partners/${id}`);
  return data.data;
}
export interface CreatedLogin { user_id: string; mobile: string; temporary_password_set: boolean }
export async function createPartner(body: ReturnType<typeof buildCreateBody>) {
  const { data } = await api.post('/admin/partners', body);
  return data.data as { vendor_id: string; logins: CreatedLogin[] };
}
export async function updatePartner(id: string, body: ReturnType<typeof buildUpdateBody>) {
  const { data } = await api.put(`/admin/partners/${id}`, body);
  return data.data as { vendor_id: string };
}
export async function addPartnerLogin(id: string, body: { mobile: string; full_name: string | null; temporary_password: string }) {
  const { data } = await api.post(`/admin/partners/${id}/logins`, body);
  return data.data as CreatedLogin;
}
