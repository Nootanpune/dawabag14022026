// Admin → Partners (Sprint 28): Dawabag's admin adds a partner pharmacy directly —
// business, GST, drug licences (Forms 20/21 retail, 20B/21B wholesale), registered
// pharmacists, address and portal logins with temporary passwords. Server:
// POST/GET/PUT /admin/partners, POST /admin/partners/:id/logins.
import api from '../api';
import {
  blankLicence, draftFromView, formLabel, licenceBodies, licenceProblems, type LicenceBadgeData, type LicenceDraft, type LicenceForm, type LicenceView,
} from '../licences/forms';

// Licences: every form a partner holds, as repeatable rows (Sprint 30, shared with suppliers and buyers)
export type { LicenceForm } from '../licences/forms';
export const licenceLabel = (t: string) => formLabel(t);

/** Sprint 39: council + valid-till entered by the admin = verified by that admin (C-03); without them the pharmacist cannot release orders */
export interface PharmacistRow { full_name: string; registration_no: string; state_council?: string | null; valid_till?: string | null }
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
  licences: LicenceDraft[];
  pharmacists: PharmacistRow[];
  logins: LoginRow[];
}

export function blankPartnerForm(): PartnerFormValues {
  return {
    legal_name: '', trade_name: '', gstin: '', contact_name: '', contact_mobile: '', contact_email: '',
    address_line1: '', address_line2: '', city: '', state: 'Maharashtra', pincode: '', invoice_prefix: '',
    licences: [blankLicence('dl20')],
    pharmacists: [{ full_name: '', registration_no: '' }],
    logins: [],
  };
}

export type PartnerLicence = LicenceView;
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
  /** renewals the partner sent from its portal, waiting for the check (and rejected ones) */
  waiting_licences: PartnerLicence[];
  licence_line: string | null;
  pharmacists: PharmacistRow[];
  logins: PartnerLogin[];
  selling_rights: { retail: boolean; wholesale: boolean };
}
export interface PartnerListRow extends LicenceBadgeData {
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
  return {
    ...f,
    licences: d.licences.length ? d.licences.map(draftFromView) : f.licences,
    legal_name: d.legal_name ?? '', trade_name: d.trade_name ?? '', gstin: d.gstin ?? '',
    contact_name: d.contact_name ?? '', contact_mobile: d.contact_mobile ?? '', contact_email: d.contact_email ?? '',
    address_line1: d.address_line1 ?? '', address_line2: d.address_line2 ?? '', city: d.city ?? '', state: d.state ?? '',
    pincode: d.pincode ?? '', invoice_prefix: d.invoice_prefix ?? '',
    pharmacists: d.pharmacists.length ? d.pharmacists.map((p) => ({ full_name: p.full_name, registration_no: p.registration_no,
      state_council: p.state_council ?? '', valid_till: p.valid_till ?? '' })) : f.pharmacists,
  };
}

function detailsBody(v: PartnerFormValues) {
  const t = (s: string) => s.trim();
  return {
    legal_name: t(v.legal_name), trade_name: t(v.trade_name) || null, gstin: t(v.gstin).toUpperCase(),
    contact_name: t(v.contact_name), contact_mobile: t(v.contact_mobile), contact_email: t(v.contact_email) || null,
    address_line1: t(v.address_line1), address_line2: t(v.address_line2) || null, city: t(v.city), state: t(v.state),
    pincode: t(v.pincode), invoice_prefix: t(v.invoice_prefix).toUpperCase(),
    licences: licenceBodies(v.licences),
    pharmacists: v.pharmacists.filter((p) => t(p.full_name) || t(p.registration_no))
      .map((p) => ({ full_name: t(p.full_name), registration_no: t(p.registration_no).toUpperCase(),
        ...(t(p.state_council ?? '') && p.valid_till ? { state_council: t(p.state_council ?? ''), valid_till: p.valid_till } : {}) })),
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
  p.push(...licenceProblems(v.licences, { party: 'partner', today, requireValidUpto: true }));
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
