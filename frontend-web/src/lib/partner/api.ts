import api from '../api';
import type { DispatchInput, HandoverInput } from '../fulfilment/handover';
import type { Settlement, SettlementDetail } from '../marketplace/settlement';
import type {
  BatchInput,
  CatalogueProduct,
  NewListing,
  PartnerListing,
  PartnerMe,
  PartnerPharmacist,
  PartnerShipment,
  SavedBatch,
  ShipmentStatus,
} from './types';

export const partnerKeys = {
  all: ['partner'] as const,
  me: ['partner', 'me'] as const,
  catalogue: (q: string) => ['partner', 'catalogue', q] as const,
  listings: ['partner', 'listings'] as const,
  shipments: (status: ShipmentStatus) => ['partner', 'shipments', status] as const,
  pharmacists: ['partner', 'pharmacists'] as const,
  settlements: ['partner', 'settlements'] as const,
  settlement: (id: string) => ['partner', 'settlements', id] as const,
};

export async function fetchPartnerMe(): Promise<PartnerMe> {
  const { data } = await api.get('/partner/me');
  return data.data;
}

export async function searchCatalogue(q: string): Promise<CatalogueProduct[]> {
  const { data } = await api.get('/partner/catalogue', { params: { q } });
  return data.data?.products ?? [];
}

export async function createListing(body: NewListing): Promise<{ id: string }> {
  const { data } = await api.post('/partner/products', body);
  return data.data;
}

export async function fetchListings(): Promise<PartnerListing[]> {
  const { data } = await api.get('/partner/products');
  return data.data?.products ?? [];
}

export async function saveInventory(listingId: string, batches: BatchInput[]): Promise<SavedBatch[]> {
  const { data } = await api.put(`/partner/products/${listingId}/inventory`, { batches });
  return data.data?.batches ?? [];
}

export async function fetchShipments(status: ShipmentStatus): Promise<PartnerShipment[]> {
  const { data } = await api.get('/partner/shipments', { params: { status } });
  return data.data?.shipments ?? [];
}

/** Sprint 35: the partner's own registered pharmacists, who check and release its shipments (C-08). */
export async function fetchPartnerPharmacists(): Promise<PartnerPharmacist[]> {
  const { data } = await api.get('/partner/pharmacists');
  return data.data?.pharmacists ?? [];
}

/** Release for packing, hold, or refuse to supply — recorded against the chosen pharmacist. */
export async function decidePartnerCheck(id: string, body: { decision: 'release' | 'hold' | 'reject'; vendor_pharmacist_id: string; reason?: string; edits_seen?: number }) {
  const { data } = await api.post(`/partner/shipments/${id}/check`, body);
  return data.data as { shipment_id: string; pharmacist_check: string };
}

/** Seal number is required (C-26). */
export async function dispatchShipment(id: string, body: DispatchInput) {
  const { data } = await api.post(`/partner/shipments/${id}/dispatch`, body);
  return data.data as { id: string; status: string };
}

/** Code + receiver for prescription shipments (C-26). */
export async function markShipmentDelivered(id: string, handover: HandoverInput = {}) {
  const { data } = await api.post(`/partner/shipments/${id}/delivered`, handover);
  return data.data as { id: string; status: string };
}

export async function fetchMySettlements(): Promise<Settlement[]> {
  const { data } = await api.get('/partner/settlements');
  return data.data?.settlements ?? [];
}

export async function fetchMySettlement(id: string): Promise<SettlementDetail> {
  const { data } = await api.get(`/partner/settlements/${id}`);
  return data.data;
}
