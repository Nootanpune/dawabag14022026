// Pure rules for onboarding a marketplace partner (Sprint 28). No database here,
// so every rule is unit-tested (rules.test.ts) and the service only orchestrates.
//
// Drug licences moved to services/licences (Sprint 30): one register and one set of
// rules for partners, suppliers and buyers. Selling rights from the partner's checked,
// in-date licences: retail (20/21) → patients; wholesale (20B/21B) → licensed trade buyers.
import { licenceRights } from '../licences/forms';

/** Sprint 39: with the council and valid-till, the admin entering a pharmacist verifies it (as for licences, C-03) */
export interface PharmacistIn { full_name: string; registration_no: string; state_council?: string | null; valid_till?: string | null }

export function sellingRights(licences: { form: string; valid_upto: string | null; status?: string }[], today: string) {
  const r = licenceRights(licences, today);
  return { retail: r.retail, wholesale: r.wholesale };
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
