// Doctor portal API (role 'doctor'). Registration is checked by an admin against
// the council register before slots or prescriptions are allowed (C-22).
import api from '../api';
import type {
  CancelResult, ConsultationDetail, DoctorConsultation, DoctorProfile, IssuedPrescription, MedicineHit, NewSlot, OwnSlot, PrescriptionInput, ProfileInput,
} from './types';

export const doctorKeys = {
  all: ['doctor-portal'] as const,
  profile: ['doctor-portal', 'profile'] as const,
  day: (date: string) => ['doctor-portal', 'day', date] as const,
  slots: (from: string, to: string) => ['doctor-portal', 'slots', from, to] as const,
  consultation: (id: string) => ['doctor-portal', 'consultation', id] as const,
  medicines: (q: string) => ['doctor-portal', 'medicines', q] as const,
};

/** null until the doctor has saved a profile (the server answers 404). */
export async function fetchMyProfile(): Promise<DoctorProfile | null> {
  try {
    const { data } = await api.get('/doctors/me/profile');
    return data.data;
  } catch (err: any) {
    if (err?.response?.status === 404) return null;
    throw err;
  }
}

/** Changing registration details sends the profile back for checking. */
export async function saveMyProfile(body: ProfileInput) {
  const { data } = await api.put('/doctors/me/profile', body);
  return data.data as { id: string; is_verified: boolean; message: string };
}

/** 403 until verified. Slots the doctor already has are skipped. */
export async function addSlots(slots: NewSlot[]) {
  const { data } = await api.post('/doctors/me/slots', { slots });
  return data.data as { added: number; skipped: number };
}

/** The doctor's own slots in a date range, booked and blocked ones included (403 until verified). */
export async function fetchMySlots(from: string, to: string): Promise<OwnSlot[]> {
  const { data } = await api.get('/doctors/me/slots', { params: { from, to } });
  return Array.isArray(data.data) ? data.data : [];
}

export async function blockSlot(slotId: string) {
  const { data } = await api.post(`/doctors/me/slots/${slotId}/block`);
  return data.data as { id: string; blocked: boolean };
}

export async function fetchDoctorDay(date: string): Promise<DoctorConsultation[]> {
  const { data } = await api.get('/consultations/doctor', { params: { date } });
  return Array.isArray(data.data) ? data.data : [];
}

/** One consultation; the server answers only for its patient or its doctor. */
export async function fetchConsultation(id: string): Promise<ConsultationDetail> {
  const { data } = await api.get(`/consultations/${id}`);
  return data.data;
}

export async function endConsultation(id: string, notes?: string) {
  const { data } = await api.post(`/consultations/${id}/end`, notes ? { notes } : {});
  return data.data as { id: string; status: 'completed' };
}

export async function doctorCancelConsultation(id: string, reason: string): Promise<CancelResult> {
  const { data } = await api.post(`/consultations/${id}/cancel`, { reason });
  return data.data;
}

/** 422 lists every medicine the guidelines do not allow in this consultation (C-23). */
export async function issuePrescription(consultationId: string, body: PrescriptionInput): Promise<IssuedPrescription> {
  const { data } = await api.post(`/consultations/${consultationId}/prescription`, body);
  return data.data;
}

/** Public catalogue search; each hit carries its TPG list (C-23). */
export async function searchMedicines(q: string): Promise<MedicineHit[]> {
  const { data } = await api.get('/products/search', { params: { q, limit: 10 } });
  return data.data?.products ?? [];
}
