// Sales to doctors and medical institutions — pure rules (Sprint 44). No database imports:
// unit-tested in rules.test.ts.
//
// Maharashtra FDA (Pune Division) circular to wholesale licence holders, No.
// Drug/Wholesalers Memo./16/2026/1 dated 30-09-2026, directing under the Drugs Rules 1945:
//   (1) r.64(2)    — every sale under the direct supervision of a qualified competent person /
//                    registered pharmacist (Dawabag: the Sprint 35 pharmacist check, which
//                    every doctor / institution order passes; the sale record names them);
//   (2) r.65(9)(b) — no supply to a Registered Medical Practitioner without a valid, signed
//                    written order; never to an unqualified / unauthorised "doctor";
//   (3) records of every sale to doctors / medical institutions: bills, purchase-sale
//       records and a copy of the doctor's valid registration certificate.
// Non-compliance can suspend or cancel the sale licence.
//
// Here: when a doctor / institution buyer may be sold to (registration verified by Dawabag
// staff, in date, certificate copy on file; an institution also has its own checked
// registration / licence and names its responsible RMP), the snapshot kept with each sale,
// and the in-app requisition text the doctor signs.

export const PRACTITIONER_TYPE = 'doc_hospital';
export const REGISTRATION_INVALID = 'PRACTITIONER_REGISTRATION_INVALID';
export const WRITTEN_ORDER_REQUIRED = 'WRITTEN_ORDER_REQUIRED';
export const CIRCULAR = 'FDA Maharashtra (Pune Division) circular No. Drug/Wholesalers Memo./16/2026/1 dated 30-09-2026';

export type PractitionerKind = 'doctor' | 'institution';

export interface RegistrationRow {
  practitioner_kind: string | null;
  nmc_reg_number: string | null;
  nmc_council_state: string | null;
  nmc_status: string | null;
  /** YYYY-MM-DD */
  nmc_valid_till: string | null;
  nmc_certificate_key: string | null;
  nmc_verified_at: unknown;
  nmc_doctor_name_as_per_register: string | null;
  full_name: string | null;
  business_name: string | null;
}

/** An institution's own registration / licence (a checked party_licences row, Sprint 30). */
export interface InstitutionLicence { label: string; number: string; valid_upto: string | null; status: string }

export interface Standing {
  ok: boolean;
  state: 'verified' | 'not_verified' | 'details_missing' | 'expired' | 'suspended' | 'rejected' | 'institution_unverified';
  message: string;
  valid_till: string | null;
}

export const kindOf = (r: Pick<RegistrationRow, 'practitioner_kind'>): PractitionerKind =>
  (r.practitioner_kind === 'institution' ? 'institution' : 'doctor');

/** May Dawabag (or a partner) sell to this doctor / institution today? With the plain reason when not. */
export function registrationStanding(r: RegistrationRow, today: string, institutionLicences: InstitutionLicence[] = []): Standing {
  const who = kindOf(r) === 'institution' ? "your institution's responsible doctor's" : 'your';
  const base = { valid_till: r.nmc_valid_till };
  if (r.nmc_status === 'suspended') {
    return { ...base, ok: false, state: 'suspended',
      message: `Orders are paused: ${who} medical council registration is marked suspended. Medicines can only be supplied to a registered medical practitioner (Drugs Rules 1945, r.65(9)(b)). Contact Dawabag once it is restored.` };
  }
  if (r.nmc_status === 'rejected') {
    return { ...base, ok: false, state: 'rejected',
      message: `Orders are not possible: Dawabag could not verify ${who} medical council registration. Upload a clear copy of the registration certificate and ask us to check it again.` };
  }
  if (r.nmc_status !== 'verified') {
    return { ...base, ok: false, state: 'not_verified',
      message: `Orders open once Dawabag has verified ${who} medical council registration against the council's register and the certificate you uploaded (Drugs Rules 1945, r.65(9)(b)).` };
  }
  if (!r.nmc_valid_till || !r.nmc_certificate_key || !r.nmc_verified_at) {
    return { ...base, ok: false, state: 'details_missing',
      message: `Orders are paused until Dawabag records until when ${who} medical council registration is valid, with the certificate copy it checked. Upload your current registration certificate (Account → Documents) and we will verify it.` };
  }
  if (r.nmc_valid_till < today) {
    return { ...base, ok: false, state: 'expired',
      message: `Orders are paused: ${who} medical council registration was valid till ${r.nmc_valid_till}. Upload the renewed registration certificate and Dawabag will verify it.` };
  }
  if (kindOf(r) === 'institution') {
    const good = institutionLicences.some((l) => l.status === 'verified' && (!l.valid_upto || l.valid_upto >= today));
    if (!good) {
      return { ...base, ok: false, state: 'institution_unverified',
        message: "Orders are paused: the institution's own registration or licence is not verified or has lapsed. Add it under Your drug licences (with a copy) and Dawabag will verify it." };
    }
  }
  return { ...base, ok: true, state: 'verified', message: `Registration verified, valid till ${r.nmc_valid_till}.` };
}

export interface PractitionerSnapshot {
  kind: PractitionerKind;
  /** the doctor (or the institution's responsible RMP) as on the council's register */
  name: string;
  registration_number: string | null;
  council: string | null;
  valid_till: string | null;
  certificate_key: string | null;
  verified_at: string | null;
  institution: { name: string; licences: { label: string; number: string; valid_upto: string | null }[] } | null;
}

/** The buyer's registration as on the day of sale / of signing (kept with the sale record). */
export function practitionerSnapshot(r: RegistrationRow, institutionLicences: InstitutionLicence[] = []): PractitionerSnapshot {
  const kind = kindOf(r);
  return {
    kind,
    name: (r.nmc_doctor_name_as_per_register || r.full_name || '').trim(),
    registration_number: r.nmc_reg_number,
    council: r.nmc_council_state,
    valid_till: r.nmc_valid_till,
    certificate_key: r.nmc_certificate_key,
    verified_at: r.nmc_verified_at ? new Date(r.nmc_verified_at as string).toISOString() : null,
    institution: kind === 'institution'
      ? { name: (r.business_name || '').trim(), licences: institutionLicences.filter((l) => l.status === 'verified').map(({ label, number, valid_upto }) => ({ label, number, valid_upto })) }
      : null,
  };
}

/** "Dr Asha Rao" → "asharao": names compared without titles, dots, spaces or case. */
export function nameKey(name: string | null | undefined): string {
  return String(name ?? '').toLowerCase().replace(/^\s*(dr|doctor)\.?\s+/, '').replace(/[^a-z]/g, '');
}

/** The typed signature must be the registered doctor's own name. */
export function typedNameMatches(typed: string, snap: Pick<PractitionerSnapshot, 'name'>): boolean {
  const t = nameKey(typed);
  return t.length >= 3 && t === nameKey(snap.name);
}

export interface RequisitionItem { product_id: string; product_name: string; quantity: number }

/** The exact text the doctor signs (and whose hash is kept). */
export function requisitionText(snap: PractitionerSnapshot, items: RequisitionItem[], signedAtIso: string): string {
  const who = snap.kind === 'institution'
    ? `I, Dr ${snap.name}, the registered medical practitioner responsible for ${snap.institution?.name || 'the institution'}`
    : `I, Dr ${snap.name}`;
  const lines = items.map((i, n) => `${n + 1}. ${i.product_name} — ${i.quantity} unit(s)`);
  return [
    'WRITTEN ORDER FOR DRUGS (Drugs Rules 1945, r.65(9)(b))',
    `${who}, registered with ${snap.council || 'the medical council'} under No. ${snap.registration_number || '—'}`
      + `${snap.valid_till ? ` (valid till ${snap.valid_till})` : ''}, order the following drugs from Dawabag for use in my professional practice`
      + `${snap.kind === 'institution' ? ' / for the patients of the institution' : ' for my own patients'} and not for resale:`,
    ...lines,
    `Signed electronically through my own Dawabag login on ${signedAtIso}.`,
  ].join('\n');
}

/** Order lines the written order does not cover (product missing, or more than ordered in writing). Upload: not checkable here. */
export function notCovered(items: RequisitionItem[] | null, lines: { product_id: string; product_name: string; quantity: number }[]): string[] {
  if (!items) return [];
  const allowed = new Map<string, number>();
  for (const i of items) allowed.set(i.product_id, (allowed.get(i.product_id) ?? 0) + Number(i.quantity));
  const want = new Map<string, { name: string; qty: number }>();
  for (const l of lines) {
    const w = want.get(l.product_id) ?? { name: l.product_name, qty: 0 };
    w.qty += Number(l.quantity);
    want.set(l.product_id, w);
  }
  return [...want.entries()].filter(([id, w]) => w.qty > (allowed.get(id) ?? 0)).map(([, w]) => w.name);
}

export function writtenOrderRequiredMessage(): string {
  return 'A signed written order is needed for every order from a doctor or medical institution (Drugs Rules 1945, r.65(9)(b)). '
    + 'Upload your signed requisition, or sign the requisition for this cart in the app, then place the order.';
}
