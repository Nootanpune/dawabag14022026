// Dawabag's own riders (Sprint 13; C-26 hand-over, C-41 least access).
// Packers/admins pick a rider at dispatch or hand a parcel to another rider;
// a rider sees only their own run sheet. The server enforces every rule.
import api from '../api';
import type { Rider, RunStop } from './types';

/** Courier name the server records for a parcel out with Dawabag's own rider */
export const OWN_RIDER_COURIER = 'Dawabag rider';

export const riderKeys = {
  riders: ['fulfilment', 'riders'] as const,
  myRun: ['fulfilment', 'my-run'] as const,
};

/** GET /fulfilment/riders (packer / admin) */
export async function fetchRiders(): Promise<Rider[]> {
  const { data } = await api.get('/fulfilment/riders');
  return data.data ?? [];
}

/** GET /fulfilment/my-run (delivery) — the signed-in rider's parcels */
export async function fetchMyRun(): Promise<RunStop[]> {
  const { data } = await api.get('/fulfilment/my-run');
  return data.data ?? [];
}

/** POST /fulfilment/shipments/:id/rider — only a parcel already out with a rider (409 otherwise) */
export async function reassignRider(shipmentId: string, riderId: string) {
  const { data } = await api.post(`/fulfilment/shipments/${shipmentId}/rider`, { rider_id: riderId });
  return data.data as { shipment_id: string; rider_id: string };
}

export function riderLabel(r: Rider): string {
  return `${r.full_name ?? 'Rider'} · ${r.mobile}${r.out_now ? ` · ${r.out_now} out now` : ''}`;
}
