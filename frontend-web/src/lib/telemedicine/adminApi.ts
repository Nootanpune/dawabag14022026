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

/** Checked against the NMC / state council register; notes 3–1000 characters. */
export async function verifyDoctor(id: string, approve: boolean, notes: string) {
  const { data } = await api.post(`/doctors/${id}/verify`, { approve, notes });
  return data.data as { id: string; is_verified: boolean };
}

/** Schedule X / NDPS always come back 'prohibited' whatever is sent. */
export async function setTelemedicineList(productId: string, list: TeleList, notes: string) {
  const { data } = await api.post(`/products/${productId}/telemedicine-list`, { list, notes });
  return data.data as { id: string; telemedicine_list: TeleList };
}
