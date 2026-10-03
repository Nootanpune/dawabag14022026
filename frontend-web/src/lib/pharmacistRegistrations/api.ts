// Pharmacist registration validity (Sprint 39, handover D10; C-03, C-08). Recorded and
// verified by admins on the server; a lapsed, expired, suspended or unverified
// registration blocks the pharmacist's gates there. Nothing is kept in the browser.
import api from '../api';

export type RegistrationStatus = 'active' | 'lapsed' | 'suspended';
export type StandingState = 'valid' | 'not_recorded' | 'missing' | 'number_changed' | 'unverified' | 'expired' | 'lapsed' | 'suspended';

export interface Standing { ok: boolean; state: StandingState; message: string | null; days_left: number | null }

export interface StaffRegistration {
  user_id: string;
  full_name: string | null;
  mobile: string;
  pharmacist_reg_no: string | null;
  state_council: string | null;
  registration_no: string | null;
  valid_till: string | null;
  status: RegistrationStatus | null;
  status_note: string | null;
  verified_at: string | null;
  verified_by_name: string | null;
  recorded_before_sprint39: boolean | null;
  standing: Standing;
}

export interface PartnerRegistration {
  id: string;
  vendor_id: string;
  partner_name: string;
  full_name: string;
  registration_no: string;
  state_council: string | null;
  valid_till: string | null;
  status: RegistrationStatus;
  status_note: string | null;
  verified_at: string | null;
  verified_by_name: string | null;
  recorded_before_sprint39: boolean;
  standing: Standing;
}

export interface RegistrationInput {
  state_council?: string | null;
  registration_no?: string | null;
  valid_till?: string | null;
  status?: RegistrationStatus;
  status_note?: string | null;
  verified?: boolean;
}

export const STANDING_LABELS: Record<StandingState, string> = {
  valid: 'Valid', not_recorded: 'Not yet recorded', missing: 'Not recorded', number_changed: 'Number changed',
  unverified: 'Not verified', expired: 'Expired', lapsed: 'Lapsed', suspended: 'Suspended',
};

export const registrationKeys = { all: ['pharmacist-registrations'] as const, me: ['pharmacist-registrations', 'me'] as const };

export async function fetchRegistrations() {
  const { data } = await api.get('/pharmacist-registrations');
  return data.data as { staff: StaffRegistration[]; partners: PartnerRegistration[] };
}

export async function saveStaffRegistration(userId: string, input: RegistrationInput) {
  const { data } = await api.put(`/pharmacist-registrations/staff/${userId}`, input);
  return data.data;
}

export async function savePartnerRegistration(id: string, input: RegistrationInput) {
  const { data } = await api.put(`/pharmacist-registrations/partner/${id}`, input);
  return data.data;
}

export async function fetchMyRegistration() {
  const { data } = await api.get('/pharmacist-registrations/me');
  return data.data as { registration_no: string | null; standing: Standing };
}
