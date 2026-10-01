// Shapes returned by the teleconsultation API (/api/v1/doctors, /consultations,
// /eprescriptions) — Telemedicine Practice Guidelines 2020, C-22..C-24.
// Money is integer paise; times are 'HH:MM:SS' in India time.

export type ConsultMode = 'video' | 'audio' | 'text';
export type ConsultKind = 'first' | 'follow_up';
export type ConsultStatus = 'booked' | 'in_progress' | 'completed' | 'cancelled' | string;
/** 'refund_pending': cancelled after payment, gateway refund not yet confirmed */
export type PaymentStatus = 'unpaid' | 'paid' | 'waived' | 'refund_pending' | 'refunded' | string;
/** pharmacist's TPG classification of a medicine (C-23) */
export type TeleList = 'O' | 'A' | 'B' | 'prohibited';

/** Public directory row: verified doctors only, with their council registration (C-22) */
export interface Doctor {
  id: string;
  full_name: string;
  qualification: string;
  speciality: string | null;
  clinic_name: string | null;
  council: string;
  nmc_reg_number: string;
  registration_year: number;
  consultation_fee_paise: number;
  bio: string | null;
  languages_spoken: string[] | null;
}

export interface Slot {
  id: string;
  slot_date: string;
  slot_start: string;
  slot_end: string;
}

/** GET /doctors/me/profile — the doctor's own row */
export interface DoctorProfile extends Doctor {
  is_verified: boolean;
  is_active: boolean;
  rejection_reason: string | null;
  verified_at: string | null;
}

export interface ProfileInput {
  full_name: string;
  qualification: string;
  council: string;
  nmc_reg_number: string;
  registration_year: number;
  speciality?: string;
  clinic_name?: string;
  consultation_fee_paise: number;
  bio?: string;
  languages_spoken?: string[];
}

export interface NewSlot {
  slot_date: string; // YYYY-MM-DD
  slot_start: string; // HH:MM
  slot_end: string; // HH:MM
}

export interface BookingInput {
  doctor_id: string;
  slot_id: string;
  patient_id?: string;
  mode: ConsultMode;
  chief_complaint: string;
  consent: true;
}

export interface Booking {
  id: string;
  mode: ConsultMode;
  consult_kind: ConsultKind;
  fee_paise: number;
  payment_status: PaymentStatus;
}

/** GET /consultations/my */
export interface MyConsultation {
  id: string;
  mode: ConsultMode;
  status: ConsultStatus;
  consult_kind: ConsultKind;
  fee_paise: number;
  payment_status: PaymentStatus;
  chief_complaint: string;
  started_at: string | null;
  ended_at: string | null;
  doctor_name: string;
  qualification: string;
  council: string;
  nmc_reg_number: string;
  speciality: string | null;
  slot_date: string | null;
  slot_start: string | null;
  prescription_id: string | null;
}

/** GET /consultations/doctor?date= */
export interface DoctorConsultation {
  id: string;
  mode: ConsultMode;
  status: ConsultStatus;
  consult_kind: ConsultKind;
  payment_status: PaymentStatus;
  chief_complaint: string;
  slot_date: string;
  slot_start: string;
  slot_end: string;
  patient_name: string | null;
  patient_gender: string | null;
  patient_age: number | null;
  prescription_id: string | null;
}

/** GET /doctors/me/slots?from&to — the doctor's own slots, booked and blocked ones included */
export interface OwnSlot extends Slot {
  is_booked: boolean;
  is_blocked: boolean;
  consultation_id: string | null;
}

/** GET /consultations/:id — for its patient or its doctor */
export interface ConsultationDetail {
  id: string;
  mode: ConsultMode;
  status: ConsultStatus;
  consult_kind: ConsultKind;
  fee_paise: number;
  payment_status: PaymentStatus;
  chief_complaint: string;
  started_at: string | null;
  ended_at: string | null;
  doctor_id: string;
  doctor_name: string;
  qualification: string;
  council: string;
  nmc_reg_number: string;
  slot_date: string | null;
  slot_start: string | null;
  slot_end: string | null;
  patient_name: string | null;
  patient_gender: string | null;
  patient_age: number | null;
  prescription_id: string | null;
}

/** GET /consultations/:id/join — the call client opens with these */
export interface JoinInfo {
  channel: string;
  mode: ConsultMode;
  app_id: string | null;
  role: 'doctor' | 'patient';
  /**
   * Sprint 13 (C-23): a call token for this channel and this person only. `uid`
   * is the Agora user account the token is bound to; `token` is null when the
   * video provider is not configured on the server.
   */
  uid?: string;
  token?: string | null;
  /** seconds the token stays valid (until an hour after the slot ends) */
  token_expires_in?: number;
}

export interface PayOrder {
  gateway_order_id: string;
  amount_paise: number;
  key_id: string;
}

export interface CancelResult {
  id: string;
  status: 'cancelled';
  /** refund created at the gateway, or { pending: true } when it is queued for retry */
  refund: { id: string; amount_paise: number } | { pending: true; amount_paise: number } | null;
}

export interface PrescriptionItemInput {
  product_id: string;
  dosage: string;
  frequency: string;
  duration_days: number;
  instructions?: string;
}

export interface PrescriptionInput {
  diagnosis: string;
  advice?: string;
  new_condition?: boolean;
  items: PrescriptionItemInput[];
}

export interface IssuedPrescription {
  id: string;
  verification_code: string;
  valid_until: string;
  consult_kind: ConsultKind;
}

export interface EPrescriptionItem {
  medicine_name: string;
  dosage: string;
  frequency: string;
  duration_days: number;
  instructions?: string | null;
  telemedicine_list?: TeleList | null;
}

/** GET /consultations/prescriptions/:id */
export interface EPrescription {
  id: string;
  consultation_id: string;
  diagnosis: string;
  advice: string | null;
  issued_at: string;
  valid_until: string;
  verification_code: string;
  consult_kind: ConsultKind;
  consult_mode: ConsultMode;
  doctor_name: string;
  doctor_qualification: string;
  doctor_reg_no: string;
  doctor_council: string;
  patient_name: string | null;
  patient_age: number | null;
  patient_gender: string | null;
  sent_to_dawabag: boolean;
  items: EPrescriptionItem[];
}

/** GET /eprescriptions/verify/:code — public, minimal (C-24) */
export interface VerifyResult {
  valid: boolean;
  issued_at: string;
  valid_until: string;
  consult_mode: ConsultMode;
  doctor: { name: string; qualification: string; registration_no: string; council: string };
  patient: { initials: string; age: number | null; gender: string | null };
  items: EPrescriptionItem[];
}

export interface UseResult {
  prescription_id: string;
  status: string;
  order_id: string | null;
}

// ── Admin ───────────────────────────────────────────────────────────────────
export type DoctorReviewStatus = 'pending' | 'verified' | 'rejected';

export interface AdminDoctor extends Doctor {
  is_verified: boolean;
  verified_at: string | null;
  rejection_reason: string | null;
  mobile: string;
  verified_by_name: string | null;
}

/** product search hit for the prescription form; telemedicine_list null = not yet classified by the pharmacist */
export interface MedicineHit {
  id: string;
  name: string;
  generic_name?: string | null;
  sku?: string;
  drug_schedule: string | null;
  telemedicine_list?: TeleList | null;
}
