// Buyer prescriptions (C-08). Files go only to the server object store; a saved,
// verified prescription can be offered for a new order, and the pharmacist still
// checks and applies it before anything is dispensed.
import api from '../api';
import { isOnOrAfterTodayIST } from '../dates';

export interface MyPrescription {
  id: string;
  status: string;
  valid_until: string | null;
  created_at: string;
  is_digital: boolean;
  doctor_name: string | null;
  order_id: string | null;
  patient_name: string | null;
}

export const prescriptionKeys = { mine: ['prescriptions', 'my'] as const };

export async function fetchMyPrescriptions(): Promise<MyPrescription[]> {
  const { data } = await api.get('/prescriptions/my');
  return Array.isArray(data.data) ? data.data : data.data?.prescriptions ?? [];
}

/** Verified and valid today or later (the server makes the final check). */
export function isReusable(rx: MyPrescription): boolean {
  if (rx.status !== 'verified' || !rx.valid_until) return false;
  return isOnOrAfterTodayIST(rx.valid_until);
}

/** Multipart upload straight to the API (server object store). */
export async function uploadPrescription(file: File, orderId: string) {
  const form = new FormData();
  form.append('prescription', file);
  form.append('order_id', orderId);
  const { data } = await api.post('/prescriptions/upload', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 });
  return data.data;
}

/** Offer a saved, verified prescription for this order; 400 says what it does not cover or that it expired. */
export async function offerSavedPrescription(prescriptionId: string, orderId: string) {
  const { data } = await api.post(`/prescriptions/${prescriptionId}/use-for-order`, { order_id: orderId });
  return data.data as { order_id: string; prescription_id: string; status: 'awaiting_pharmacist' };
}
