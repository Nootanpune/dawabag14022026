// Teleconsultation API for patients and the public directory (C-22..C-24).
// Everything comes from the server; nothing is kept on the device.
import api from '../api';
import { downloadFromApi } from '../download';
import type {
  Booking, BookingInput, CancelResult, Doctor, EPrescription, JoinInfo, MyConsultation, PayOrder, Slot, UseResult, VerifyResult,
} from './types';

export const teleKeys = {
  all: ['telemedicine'] as const,
  doctors: (speciality: string, page: number) => ['telemedicine', 'doctors', speciality, page] as const,
  doctor: (id: string) => ['telemedicine', 'doctor', id] as const,
  slots: (doctorId: string, date: string) => ['telemedicine', 'slots', doctorId, date] as const,
  mine: ['telemedicine', 'my'] as const,
  prescription: (id: string) => ['telemedicine', 'prescription', id] as const,
  verify: (code: string) => ['telemedicine', 'verify', code] as const,
};

// ── Public ──────────────────────────────────────────────────────────────────
export async function fetchDoctors(speciality: string, page: number): Promise<Doctor[]> {
  const { data } = await api.get('/doctors', { params: { speciality: speciality || undefined, page } });
  return Array.isArray(data.data) ? data.data : [];
}

export async function fetchDoctor(id: string): Promise<Doctor> {
  const { data } = await api.get(`/doctors/${id}`);
  return data.data;
}

/** Open, future slots only. */
export async function fetchSlots(doctorId: string, date: string): Promise<Slot[]> {
  const { data } = await api.get(`/doctors/${doctorId}/slots`, { params: { date } });
  return Array.isArray(data.data) ? data.data : [];
}

/** Any pharmacy can check an e-prescription by its 10-character code (C-24). */
export async function verifyEPrescription(code: string): Promise<VerifyResult> {
  const { data } = await api.get(`/eprescriptions/verify/${encodeURIComponent(code)}`);
  return data.data;
}

// ── Patient ─────────────────────────────────────────────────────────────────
/** Consent is recorded with the booking (TPG 2020). */
export async function bookConsultation(body: BookingInput): Promise<Booking> {
  const { data } = await api.post('/consultations/book', body);
  return data.data;
}

export async function fetchMyConsultations(): Promise<MyConsultation[]> {
  const { data } = await api.get('/consultations/my');
  return Array.isArray(data.data) ? data.data : [];
}

export async function startConsultationPayment(id: string): Promise<PayOrder> {
  const { data } = await api.post(`/consultations/${id}/pay`);
  return data.data;
}

export async function verifyConsultationPayment(
  id: string,
  body: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
) {
  const { data } = await api.post(`/consultations/${id}/pay/verify`, body);
  return data.data as { id: string; payment_status: string };
}

/** Patient or the consultation's doctor; 402 unpaid, 409 more than 15 minutes early. */
export async function joinConsultation(id: string): Promise<JoinInfo> {
  const { data } = await api.get(`/consultations/${id}/join`);
  return data.data;
}

/** Patient up to 2 hours before the slot; a paid fee is refunded in full. */
export async function cancelConsultation(id: string, reason: string): Promise<CancelResult> {
  const { data } = await api.post(`/consultations/${id}/cancel`, { reason });
  return data.data;
}

export async function fetchEPrescription(id: string): Promise<EPrescription> {
  const { data } = await api.get(`/consultations/prescriptions/${id}`);
  return data.data;
}

export function downloadEPrescriptionPdf(id: string) {
  return downloadFromApi(`/consultations/prescriptions/${id}/pdf`, `e-prescription-${id.slice(0, 8)}.pdf`);
}

/** Optional: send the e-prescription to Dawabag's pharmacist (C-08). The patient may use any pharmacy instead (C-24). */
export async function sendEPrescriptionToDawabag(id: string, orderId?: string): Promise<UseResult> {
  const { data } = await api.post(`/consultations/prescriptions/${id}/use`, orderId ? { order_id: orderId } : {});
  return data.data;
}
