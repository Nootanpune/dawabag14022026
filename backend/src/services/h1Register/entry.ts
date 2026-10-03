// Schedule H1 register entries (Sprint 38; Drugs Rules r.65(9) — Rulebook C-09, C-05).
// Pure rules, unit-tested (entry.test.ts): which details an entry must have, the plain
// message that tells the pharmacist what to fill in, and which register (seller licence)
// an entry belongs to. No 'Not recorded' placeholders: a missing detail refuses dispatch.
import { numberKey } from '../licences/forms';

export interface H1Draft {
  product_name: string;
  quantity: number;
  batch_number: string | null;
  patient_name: string | null;
  patient_address: string | null;
  prescriber_name: string | null;
  prescriber_address: string | null;
  prescriber_reg_no: string | null;      // recorded when the prescription shows it (optional by law)
  prescription_id: string | null;
  pharmacist_name: string | null;
  pharmacist_reg_no: string | null;
  seller_licence_no: string | null;
}

type Where = 'prescription' | 'batch' | 'pharmacist' | 'licence';
const REQUIRED: { field: keyof H1Draft; label: string; where: Where }[] = [
  { field: 'patient_name', label: "patient's name", where: 'prescription' },
  { field: 'patient_address', label: "patient's address", where: 'prescription' },
  { field: 'prescriber_name', label: "prescriber's (doctor's) name", where: 'prescription' },
  { field: 'prescriber_address', label: "prescriber's (doctor's) address", where: 'prescription' },
  { field: 'prescription_id', label: 'verified prescription', where: 'prescription' },
  { field: 'batch_number', label: 'batch number', where: 'batch' },
  { field: 'pharmacist_name', label: "pharmacist's name", where: 'pharmacist' },
  { field: 'pharmacist_reg_no', label: "pharmacist's registration number", where: 'pharmacist' },
  { field: 'seller_licence_no', label: "seller's retail drug licence number", where: 'licence' },
];

const blank = (v: unknown) => v === null || v === undefined || String(v).trim() === '' || /^not recorded$/i.test(String(v).trim());

export function missingH1Fields(d: H1Draft): { field: keyof H1Draft; label: string; where: Where }[] {
  return REQUIRED.filter((r) => blank(d[r.field]));
}

function list(labels: string[]): string {
  return labels.length <= 1 ? labels.join('') : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/** The refusal shown to whoever pressed Dispatch: what is missing and where to fill it in. */
export function h1RefusalMessage(d: H1Draft, seller: 'dawabag' | 'partner'): string | null {
  const missing = missingH1Fields(d);
  if (!missing.length) return null;
  const where = new Set(missing.map((m) => m.where));
  const steps: string[] = [];
  if (where.has('prescription')) {
    steps.push(seller === 'partner'
      ? "Ask Dawabag's pharmacist to complete the prescription's H1 details"
      : 'A pharmacist fills them in under Pharmacist check → "Prescriptions missing H1 details"');
  }
  if (where.has('batch')) steps.push('Record the batch this line is supplied from');
  if (where.has('pharmacist')) steps.push('Release the parcel through the pharmacist check, naming the registered pharmacist');
  if (where.has('licence')) steps.push(seller === 'partner'
    ? 'Ask Dawabag to record your retail drug licence (Form 20 / 21)'
    : "Add Dawabag's retail drug licence (Form 20 / 21) under Admin → Licences");
  return `Schedule H1 register entry for ${d.product_name} is incomplete: the ${list(missing.map((m) => m.label))} `
    + `${missing.length === 1 ? 'is' : 'are'} missing. ${steps.join('. ')}, then dispatch again. Nothing was dispatched.`;
}

// ── Which register ───────────────────────────────────────────────────────────

export interface LicenceRef { form: string; number: string }

// Schedule H1 is a retail sale on prescription: the retail licence (Form 20, then 21,
// then the restricted forms) is the register's licence; otherwise the first on record.
const PREFERENCE = ['dl20', 'dl21', 'dl20a', 'dl21a'];
export function registerLicence(licences: LicenceRef[]): LicenceRef | null {
  const usable = licences.filter((l) => l.number && l.number.trim());
  for (const f of PREFERENCE) {
    const hit = usable.find((l) => l.form === f);
    if (hit) return hit;
  }
  return usable[0] ?? null;
}

/** One register per seller licence: 'dawabag:<LICENCE>' or 'partner:<vendor id>:<LICENCE>'. */
export function registerKey(seller: 'dawabag' | 'partner', partnerId: string | null, licenceNo: string): string {
  const lic = numberKey(licenceNo);
  if (!lic) throw new Error('A register needs a licence number');
  if (seller === 'partner') {
    if (!partnerId) throw new Error('A partner register needs the partner');
    return `partner:${partnerId}:${lic}`;
  }
  return `dawabag:${lic}`;
}
