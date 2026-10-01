// Staff fulfilment API — Rx verification (C-03, C-08), pack / dispatch / deliver,
// H1 register (C-09). The server enforces roles and every gate.
import api from '../api';
import { downloadFromApi } from '../download';
import type { DispatchInput, HandoverInput } from './handover';
import type { H1Entry, QueueShipment, QueueStage, RxQueueItem, StaffOrder, VerifyRxInput } from './types';

export const fulfilmentKeys = {
  all: ['fulfilment'] as const,
  queue: (stage: QueueStage) => ['fulfilment', 'queue', stage] as const,
  order: (id: string) => ['fulfilment', 'order', id] as const,
  rxUrl: (id: string) => ['fulfilment', 'rx-url', id] as const,
  h1: (from: string, to: string) => ['fulfilment', 'h1', from, to] as const,
};

export async function fetchRxQueue(): Promise<RxQueueItem[]> {
  const { data } = await api.get('/fulfilment/queue', { params: { stage: 'rx' } });
  return data.data?.items ?? [];
}

export async function fetchShipmentQueue(stage: Exclude<QueueStage, 'rx'>): Promise<QueueShipment[]> {
  const { data } = await api.get('/fulfilment/queue', { params: { stage } });
  return data.data?.items ?? [];
}

export async function fetchStaffOrder(orderId: string): Promise<StaffOrder> {
  const { data } = await api.get(`/orders/${orderId}`);
  return data.data;
}

/**
 * How to show a prescription: an uploaded file has a signed, short-lived view URL;
 * a Dawabag e-prescription from a teleconsultation (Sprint 10, C-24) has no file
 * and is opened as its PDF through the authenticated client. Each call is audited
 * on the server (C-41).
 */
export type PrescriptionSource =
  | { kind: 'file'; url: string }
  | { kind: 'digital'; eprescriptionId: string; pdfPath: string };

export async function fetchPrescriptionUrl(prescriptionId: string): Promise<PrescriptionSource> {
  const { data } = await api.get(`/prescriptions/${prescriptionId}/url`);
  const d = data.data;
  if (d?.digital) return { kind: 'digital', eprescriptionId: d.eprescription_id, pdfPath: d.pdf_path };
  return { kind: 'file', url: d.url };
}

export async function verifyPrescription(prescriptionId: string, body: VerifyRxInput) {
  const { data } = await api.post(`/fulfilment/prescriptions/${prescriptionId}/verify`, body);
  return data.data as { prescription_id: string; order_id: string; lines_covered: number; valid_until: string };
}

export async function rejectPrescription(prescriptionId: string, reason: string) {
  const { data } = await api.post(`/fulfilment/prescriptions/${prescriptionId}/reject`, { reason });
  return data.data;
}

export async function applyPrescription(prescriptionId: string, orderId: string) {
  const { data } = await api.post(`/fulfilment/prescriptions/${prescriptionId}/apply`, { order_id: orderId });
  return data.data as { lines_covered: number };
}

/** einvoice_required: a B2B invoice that must get its IRN before dispatch (C-31, Sprint 9). */
export async function packShipment(shipmentId: string) {
  const { data } = await api.post(`/fulfilment/shipments/${shipmentId}/pack`);
  return data.data as { id: string; status: string; einvoice_required?: boolean };
}

/**
 * Book Dawabag's own packed shipment with Shiprocket (Sprint 8). The server
 * refuses with 409 when booking is manual, the pack is not packed or already
 * has an AWB, 503 when Shiprocket is not configured and 502 on a provider error.
 */
export async function bookCourier(shipmentId: string) {
  const { data } = await api.post(`/fulfilment/shipments/${shipmentId}/book-courier`);
  return data.data as { shipment_id: string; awb_number: string; courier_partner: string };
}

/**
 * Seal number is required: every pack leaves tamper-evident (C-26). A B2B parcel
 * also waits for its e-invoice IRN (C-31): the server answers 409 with the reason.
 */
export async function dispatchOwnShipment(shipmentId: string, body: DispatchInput) {
  const { data } = await api.post(`/fulfilment/shipments/${shipmentId}/dispatch`, body);
  return data.data as { h1_register_rows?: number };
}

/** Handover: code + receiver for prescription shipments (C-26); admins may override with a reason. */
export async function markDelivered(shipmentId: string, handover: HandoverInput = {}) {
  const { data } = await api.post(`/fulfilment/shipments/${shipmentId}/delivered`, handover);
  return data.data;
}

export async function fetchH1Register(from: string, to: string): Promise<H1Entry[]> {
  const { data } = await api.get('/fulfilment/h1-register', { params: { from, to } });
  return data.data?.entries ?? [];
}

export function downloadH1Csv(from: string, to: string) {
  return downloadFromApi('/fulfilment/h1-register', `h1-register-${from}-to-${to}.csv`, { from, to, format: 'csv' });
}

export async function setPharmacistRegNo(userId: string, pharmacistRegNo: string) {
  const { data } = await api.patch(`/admin/users/${userId}/pharmacist`, { pharmacist_reg_no: pharmacistRegNo });
  return data.data;
}

export interface StaffUser {
  id: string;
  full_name: string | null;
  mobile: string;
  role: string;
}

/** GET /admin/users?role= (admin) — used to pick a pharmacist login */
export async function fetchUsersByRole(role: string): Promise<StaffUser[]> {
  const { data } = await api.get('/admin/users', { params: { role } });
  return Array.isArray(data.data) ? data.data : data.data?.users ?? [];
}
