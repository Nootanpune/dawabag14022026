import api from '../api';
import type { Settlement, SettlementDetail } from '../marketplace/settlement';
import type {
  BatchInput,
  CatalogueProduct,
  NewListing,
  PartnerListing,
  PartnerMe,
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

export async function dispatchShipment(id: string, body: { courier_partner: string; awb_number: string }) {
  const { data } = await api.post(`/partner/shipments/${id}/dispatch`, body);
  return data.data as { id: string; status: string };
}

export async function markShipmentDelivered(id: string) {
  const { data } = await api.post(`/partner/shipments/${id}/delivered`);
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
