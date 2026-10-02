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
  /** jpg / png / pdf, or 'eprescription' for a Dawabag e-prescription */
  file_type?: string | null;
  original_filename?: string | null;
  rejection_reason?: string | null;
  order_number?: string | null;
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

/** Uploaded on its own (the /prescriptions page) and not yet checked: it can be picked at
 *  checkout, where it joins the order and our pharmacist checks it before dispatch (C-08). */
export function isAttachable(rx: MyPrescription): boolean {
  return rx.status === 'pending' && !rx.order_id;
}

/** Prescriptions the buyer can choose at checkout. */
export const usableAtCheckout = (list: MyPrescription[]) => list.filter((r) => isReusable(r) || isAttachable(r));

/** What the server accepts (prescription.controller): JPEG, PNG or PDF up to 10 MB. */
export const PRESCRIPTION_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
export const PRESCRIPTION_MAX_BYTES = 10 * 1024 * 1024;

/** A plain-English reason the file cannot be sent, or null when it can. */
export function prescriptionFileProblem(file: File): string | null {
  if (!PRESCRIPTION_TYPES.includes(file.type)) return 'Please choose a photo (JPEG or PNG) or a PDF of your prescription.';
  if (file.size > PRESCRIPTION_MAX_BYTES) return 'This file is larger than 10 MB. Please take a smaller photo.';
  if (file.size === 0) return 'This file is empty. Please choose it again.';
  return null;
}

/** Multipart upload straight to the API (server object store); without an order it is kept for checkout. */
export async function uploadPrescription(file: File, orderId?: string) {
  const form = new FormData();
  form.append('prescription', file);
  if (orderId) form.append('order_id', orderId);
  const { data } = await api.post('/prescriptions/upload', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 });
  return data.data;
}

/** A short-lived signed link to view the file (every view is logged, C-41); e-prescriptions have none. */
export async function fetchPrescriptionLink(id: string): Promise<{ url?: string; digital?: boolean }> {
  const { data } = await api.get(`/prescriptions/${id}/url`);
  return data.data;
}

/** Offer a saved, verified prescription for this order; 400 says what it does not cover or that it expired. */
export async function offerSavedPrescription(prescriptionId: string, orderId: string) {
  const { data } = await api.post(`/prescriptions/${prescriptionId}/use-for-order`, { order_id: orderId });
  return data.data as { order_id: string; prescription_id: string; status: 'awaiting_pharmacist' };
}
