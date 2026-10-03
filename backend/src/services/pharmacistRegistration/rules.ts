// Pure rules of pharmacist registration validity (Sprint 39, handover D10; Rulebook
// C-03 registered pharmacist, C-08 prescription and supply checks, C-46 audit).
// The same rules for Dawabag's own pharmacists (pharmacist_registrations) and for
// partners' pharmacists (vendor_pharmacists). A registration that is lapsed, past its
// valid-till date, suspended or not verified by Dawabag BLOCKS:
//   prescription verification, the per-order pharmacist check (Sprint 35), a partner's
//   shipment release, and medicine-information approval (Sprint 36).
// Non-breaking start (developer's decision, documented in DECISIONS 2026-10-03):
// pharmacists already working before Sprint 39 were carried over as 'active' with no
// valid-till and not verified ("not yet recorded"); they may go on, with a warning on
// every screen, until an admin records the council, number and validity. Anyone added
// from Sprint 39 on must be verified first.
// No database imports: unit-tested in rules.test.ts.

export const REGISTRATION_STATUSES = ['active', 'lapsed', 'suspended'] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

/** Days before valid-till when admins (and a partner's owner) are told; 0 = on the day. */
export const REGISTRATION_ALERT_DAYS = [30, 0];

export interface RegistrationRecord {
  registration_no: string | null;
  state_council: string | null;
  valid_till: string | null;          // YYYY-MM-DD
  status: string;
  verified_at: string | Date | null;
  recorded_before_sprint39: boolean;
}

export type StandingState = 'valid' | 'not_recorded' | 'missing' | 'number_changed' | 'unverified' | 'expired' | 'lapsed' | 'suspended';

export interface Standing {
  ok: boolean;
  state: StandingState;
  /** why it is blocked, or the warning to complete / renew */
  message: string | null;
  days_left: number | null;
}

const norm = (s: string | null | undefined) => String(s ?? '').trim().toUpperCase();
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5);

/**
 * Where a registration stands today. `who` words the message: 'you' for the pharmacist
 * on their own screen, or a name ("Asha Rao's") for a partner's choice of pharmacist.
 */
export function registrationStanding(r: RegistrationRecord | null, currentRegNo: string | null, today: string, who = 'Your'): Standing {
  const ask = 'Ask a Dawabag admin to record and verify it (Admin → Pharmacist registrations).';
  if (!r) return { ok: false, state: 'missing', days_left: null, message: `${who} pharmacy council registration has not been recorded by Dawabag. ${ask}` };
  const daysLeft = r.valid_till ? daysBetween(today, r.valid_till) : null;
  if (currentRegNo !== null && norm(r.registration_no) !== norm(currentRegNo)) {
    return { ok: false, state: 'number_changed', days_left: daysLeft, message: `${who} registration number changed since it was verified. ${ask}` };
  }
  if (r.status === 'suspended') return { ok: false, state: 'suspended', days_left: daysLeft, message: `${who} pharmacy council registration is recorded as suspended. It cannot be used until an admin records it as active again.` };
  if (r.status === 'lapsed') return { ok: false, state: 'lapsed', days_left: daysLeft, message: `${who} pharmacy council registration is recorded as lapsed. Send the renewal to a Dawabag admin.` };
  if (daysLeft !== null && daysLeft < 0) {
    return { ok: false, state: 'expired', days_left: daysLeft, message: `${who} pharmacy council registration expired on ${r.valid_till}. Send the renewal to a Dawabag admin.` };
  }
  if (!r.verified_at) {
    if (r.recorded_before_sprint39) {
      return { ok: true, state: 'not_recorded', days_left: daysLeft,
        message: `${who} registration's council and validity are not yet recorded. ${ask}` };
    }
    return { ok: false, state: 'unverified', days_left: daysLeft, message: `${who} pharmacy council registration is not verified yet. ${ask}` };
  }
  if (daysLeft !== null && daysLeft <= REGISTRATION_ALERT_DAYS[0]) {
    return { ok: true, state: 'valid', days_left: daysLeft, message: `${who} registration expires on ${r.valid_till} (${daysLeft} day(s)). Send the renewal to a Dawabag admin.` };
  }
  return { ok: true, state: 'valid', days_left: daysLeft, message: null };
}

export interface RegistrationInput {
  state_council?: string | null;
  registration_no?: string | null;
  valid_till?: string | null;
  status?: string;
  verified?: boolean;
}

/** Plain reasons an admin's entry cannot be saved (empty = fine). */
export function registrationInputProblems(i: RegistrationInput, today: string): string[] {
  const p: string[] = [];
  if (i.status !== undefined && !(REGISTRATION_STATUSES as readonly string[]).includes(i.status)) p.push('Choose active, lapsed or suspended');
  if (i.valid_till != null && !/^\d{4}-\d{2}-\d{2}$/.test(i.valid_till)) p.push('Enter the valid-till date as YYYY-MM-DD');
  if (i.verified) {
    if (!String(i.state_council ?? '').trim()) p.push('Enter the State Pharmacy Council to verify the registration');
    if (!String(i.registration_no ?? '').trim()) p.push('Enter the registration number to verify it');
    if (!i.valid_till) p.push('Enter the valid-till date to verify the registration');
    else if (i.valid_till < today) p.push('This registration is already past its valid-till date; record it as lapsed instead of verifying it');
  }
  return p;
}
