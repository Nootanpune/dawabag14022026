// Step 2 of registration: field rules (mirrors the backend contract) and the POST /auth/register body.
import { z } from 'zod';
import type { CustomerType } from './registration';
import { POLICY_LANGUAGES, type PolicyLanguage } from './legal/policies';
import { todayIST } from './dates';

// ─── Step 2 form ─────────────────────────────────────────────────────────────
export const MOBILE_REGEX = /^[6-9]\d{9}$/;
export const PINCODE_REGEX = /^\d{6}$/;
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const RETAILER_DL_TYPES = [
  { value: 'dl20', label: 'DL Form 20' },
  { value: 'dl21', label: 'DL Form 21' },
] as const;

export const WHOLESALER_DL_TYPES = [
  { value: 'dl20b', label: 'DL Form 20B' },
  { value: 'dl21b', label: 'DL Form 21B' },
] as const;

export const SPECIALITIES = [
  'General Physician',
  'Diabetologist',
  'Cardiologist',
  'Paediatrician',
  'Gynaecologist',
  'Dermatologist',
  'Orthopaedic',
  'ENT',
  'Other',
];

export const GST_DECLARATION_TEXT: Partial<Record<CustomerType, string>> = {
  b2b_retailer: 'I confirm this business is not registered under GST.',
  doc_hospital: 'I confirm I am not registered under GST.',
};

/** Doctors / hospitals, at registration (C-15); starts unticked. */
export const PRACTITIONER_REGISTRATION_TEXT =
  'I will buy medicines only for dispensing to my own patients, not for resale. I will not order Schedule X or narcotic (NDPS) drugs online.';

/** All Step-2 fields. Fields not relevant to the chosen type are simply left empty. */
export interface DetailsFormValues {
  full_name: string;
  mobile: string;
  email: string;
  password: string;
  confirm_password: string;
  referral_code: string;
  pincode: string;
  business_name: string;
  drug_license_type: string;
  drug_license_number: string;
  /** every other drug licence the business holds (Sprint 30): e.g. Form 21 next to Form 20 */
  extra_licences: ExtraLicence[];
  pan_number: string;
  gstin: string;
  gst_unregistered_declaration: boolean;
  nmc_reg_number: string;
  nmc_council_state: string;
  speciality: string;
  practitioner_declaration: boolean;
  /** language the privacy notice was read in; consent cites that notice version + language (C-40) */
  notice_language: PolicyLanguage;
  accept_privacy_notice: boolean;
  age_confirmed: boolean;
  marketing_consent: boolean;
}

export interface ExtraLicence { form: string; number: string; valid_upto: string }

export const EMPTY_DETAILS: DetailsFormValues = {
  full_name: '',
  mobile: '',
  email: '',
  password: '',
  confirm_password: '',
  referral_code: '',
  pincode: '',
  business_name: '',
  drug_license_type: '',
  drug_license_number: '',
  extra_licences: [],
  pan_number: '',
  gstin: '',
  gst_unregistered_declaration: false,
  nmc_reg_number: '',
  nmc_council_state: '',
  speciality: '',
  practitioner_declaration: false,
  notice_language: 'en',
  accept_privacy_notice: false,
  age_confirmed: false,
  marketing_consent: false,
};

const str = z.string();

export function buildDetailsSchema(type: CustomerType) {
  const isB2B = type === 'b2b_retailer' || type === 'b2b_wholesaler';

  return z
    .object({
      full_name: str,
      mobile: str,
      email: str,
      password: str,
      confirm_password: str,
      referral_code: str,
      pincode: str,
      business_name: str,
      drug_license_type: str,
      drug_license_number: str,
      extra_licences: z.array(z.object({ form: str, number: str, valid_upto: str })),
      pan_number: str,
      gstin: str,
      gst_unregistered_declaration: z.boolean(),
      nmc_reg_number: str,
      nmc_council_state: str,
      speciality: str,
      practitioner_declaration: z.boolean(),
      notice_language: z.enum(POLICY_LANGUAGES),
      accept_privacy_notice: z.boolean(),
      age_confirmed: z.boolean(),
      marketing_consent: z.boolean(),
    })
    .superRefine((d, ctx) => {
      const issue = (path: keyof DetailsFormValues, message: string) =>
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

      const name = d.full_name.trim();
      if (name.length < 2) issue('full_name', 'Name must be at least 2 characters');
      else if (name.length > 255) issue('full_name', 'Name must be at most 255 characters');

      if (!MOBILE_REGEX.test(d.mobile.trim())) issue('mobile', 'Enter a valid 10-digit mobile number');

      const email = d.email.trim();
      if (isB2B && !email) issue('email', 'Email is required — invoices are emailed');
      else if (email && !z.string().email().safeParse(email).success) issue('email', 'Enter a valid email');

      if (d.password.length < 8) issue('password', 'Password must be at least 8 characters');
      if (d.password !== d.confirm_password) issue('confirm_password', 'Passwords do not match');

      const pincode = d.pincode.trim();
      if (type !== 'customer' && !pincode) issue('pincode', 'Pincode is required');
      else if (pincode && !PINCODE_REGEX.test(pincode)) issue('pincode', 'Enter a valid 6-digit pincode');

      if (!d.accept_privacy_notice) issue('accept_privacy_notice', 'Please accept the Privacy Notice to continue');
      if (!d.age_confirmed) issue('age_confirmed', 'You must be 18 years or older to register');

      if (type === 'customer') return;

      const pan = d.pan_number.trim().toUpperCase();
      if (!pan) issue('pan_number', 'PAN is required');
      else if (!PAN_REGEX.test(pan)) issue('pan_number', 'Enter a valid PAN (e.g. ABCDE1234F)');

      if (isB2B) {
        if (!d.business_name.trim()) issue('business_name', 'Business name is required');
        const allowed: readonly string[] = (type === 'b2b_retailer' ? RETAILER_DL_TYPES : WHOLESALER_DL_TYPES).map(
          (o) => o.value
        );
        if (!allowed.includes(d.drug_license_type)) issue('drug_license_type', 'Select the drug license type');
        if (!d.drug_license_number.trim()) issue('drug_license_number', 'Drug license number is required');

        const gstin = d.gstin.trim().toUpperCase();
        if (gstin && !GSTIN_REGEX.test(gstin)) issue('gstin', 'Enter a valid 15-character GSTIN');
        if (type === 'b2b_wholesaler' && !gstin) issue('gstin', 'GSTIN is required for wholesalers');
        if (type === 'b2b_retailer' && !gstin && !d.gst_unregistered_declaration) {
          issue('gst_unregistered_declaration', 'Enter your GSTIN or confirm you are not registered under GST');
        }
      }

      // Extra licences: a form and a number each, every form once (the server repeats the checks)
      const seen = new Set<string>(isB2B && d.drug_license_type ? [d.drug_license_type] : []);
      d.extra_licences.forEach((l, i) => {
        const path = ['extra_licences', i, 'number'];
        if (!l.form) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['extra_licences', i, 'form'], message: 'Choose the licence form' });
        else if (seen.has(l.form)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['extra_licences', i, 'form'], message: 'This form is already entered' });
        seen.add(l.form);
        if (l.number.replace(/[^A-Za-z0-9]/g, '').length < 3) ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: 'Enter the licence number' });
        if (l.valid_upto && l.valid_upto < todayIST()) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['extra_licences', i, 'valid_upto'], message: 'This licence has expired' });
        }
      });

      if (type === 'doc_hospital') {
        if (!d.nmc_reg_number.trim()) issue('nmc_reg_number', 'Registration number is required');
        if (!d.nmc_council_state.trim()) issue('nmc_council_state', 'Medical council is required');
        if (!d.speciality.trim()) issue('speciality', 'Select your speciality');
        if (!d.gst_unregistered_declaration) {
          issue('gst_unregistered_declaration', 'Please confirm the GST declaration');
        }
        if (!d.practitioner_declaration) {
          issue('practitioner_declaration', 'Confirm you will buy only to treat your own patients, not for resale');
        }
      }
    });
}

const extraBodies = (d: DetailsFormValues) => d.extra_licences.filter((l) => l.form || l.number.trim())
  .map((l) => ({ form: l.form, licence_number: l.number.trim(), valid_upto: l.valid_upto || null }));

/** Builds the POST /auth/register body for the chosen type (only fields that apply). */
export function buildRegisterPayload(type: CustomerType, d: DetailsFormValues): Record<string, unknown> {
  const opt = (v: string) => (v.trim() ? v.trim() : undefined);

  const body: Record<string, unknown> = {
    customer_type: type,
    full_name: d.full_name.trim(),
    mobile: d.mobile.trim(),
    password: d.password,
    email: opt(d.email),
    referral_code: opt(d.referral_code)?.toUpperCase(),
    pincode: opt(d.pincode),
    accept_privacy_notice: d.accept_privacy_notice,
    notice_language: d.notice_language, // C-40
    age_confirmed: d.age_confirmed,
    marketing_consent: d.marketing_consent,
  };

  if (type === 'b2b_retailer' || type === 'b2b_wholesaler') {
    const gstin = d.gstin.trim().toUpperCase();
    Object.assign(body, {
      business_name: d.business_name.trim(),
      // Every licence the business holds (Sprint 30); the first is the one chosen above
      licences: [{ form: d.drug_license_type, licence_number: d.drug_license_number.trim() }, ...extraBodies(d)],
      pan_number: d.pan_number.trim().toUpperCase(),
      gstin: gstin || undefined,
    });
    if (type === 'b2b_retailer') body.gst_unregistered_declaration = !gstin && d.gst_unregistered_declaration;
  }

  if (type === 'doc_hospital' && d.extra_licences.length) body.licences = extraBodies(d);
  if (type === 'doc_hospital') {
    Object.assign(body, {
      nmc_reg_number: d.nmc_reg_number.trim(),
      nmc_council_state: d.nmc_council_state.trim(),
      speciality: d.speciality,
      pan_number: d.pan_number.trim().toUpperCase(),
      gst_unregistered_declaration: d.gst_unregistered_declaration,
      practitioner_declaration: d.practitioner_declaration, // C-15
    });
  }

  return body;
}
