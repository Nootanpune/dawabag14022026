// Doctor portal API (role 'doctor'). Registration is checked by an admin against
// the council register before slots or prescriptions are allowed (C-22).
import api from '../api';
import type {
  CancelResult, DoctorConsultation, DoctorProfile, IssuedPrescription, MedicineHit, NewSlot, PrescriptionInput, ProfileInput,
} from './types';

export const doctorKeys = {
  all: ['doctor-portal'] as const,
  profile: ['doctor-portal', 'profile'] as const,
  day: (date: string) => ['doctor-portal', 'day', date] as const,
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

export async function blockSlot(slotId: string) {
  const { data } = await api.post(`/doctors/me/slots/${slotId}/block`);
  return data.data as { id: string; blocked: boolean };
}

export async function fetchDoctorDay(date: string): Promise<DoctorConsultation[]> {
  const { data } = await api.get('/consultations/doctor', { params: { date } });
  return Array.isArray(data.data) ? data.data : [];
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

/** Public catalogue search; the TPG list is shown when the API includes it. */
export async function searchMedicines(q: string): Promise<MedicineHit[]> {
  const { data } = await api.get('/products/search', { params: { q, limit: 10 } });
  return data.data?.products ?? [];
}
