// Admin checks of doctor registrations (C-22) and the pharmacist's TPG list for
// each medicine (C-23).
import api from '../api';
import type { AdminDoctor, DoctorReviewStatus, TeleList } from './types';

export const adminDoctorKeys = {
  all: ['admin', 'doctors'] as const,
  list: (status: DoctorReviewStatus | '') => ['admin', 'doctors', status] as const,
};

/** Turns an existing customer account (by mobile) into a doctor login. */
export async function enableDoctor(mobile: string) {
  const { data } = await api.post('/doctors/admin/enable', { mobile });
  return data.data as { user_id: string; role: string };
}

export async function fetchAdminDoctors(status: DoctorReviewStatus | ''): Promise<AdminDoctor[]> {
  const { data } = await api.get('/doctors/admin/list', { params: status ? { status } : undefined });
  return data.data?.doctors ?? [];
}

export interface VerifyDoctorResult {
  id: string;
  is_verified: boolean;
  /** rejection: the doctor's open consultations cancelled and refunded */
  consultations_cancelled_refunds?: number;
}

/**
 * Checked against the NMC / state council register (C-22); notes 3–1000 characters.
 * Approving sends the registration number the admin checked — 409 if the profile changed meanwhile.
 */
export async function verifyDoctor(id: string, approve: boolean, notes: string, nmcRegNumber?: string) {
  const body: Record<string, unknown> = { approve, notes };
  if (approve) body.nmc_reg_number = nmcRegNumber;
  const { data } = await api.post(`/doctors/${id}/verify`, body);
  return data.data as VerifyDoctorResult;
}

/** Schedule X / NDPS always come back 'prohibited' whatever is sent. */
export async function setTelemedicineList(productId: string, list: TeleList, notes: string) {
  const { data } = await api.post(`/products/${productId}/telemedicine-list`, { list, notes });
  return data.data as { id: string; telemedicine_list: TeleList };
}
