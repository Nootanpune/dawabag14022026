// Who supplied each partner batch (Sprint 39, owner decision 2026-10-03; C-02, C-28):
// recorded once from the partner's stock file, portal or live feed, never changed, and
// disclosed to Dawabag's admin. Read from the server on every load.
import api from '../api';

export interface BatchProvenance {
  partner_inventory_id: string;
  partner_id: string;
  partner_name: string;
  product_id: string | null;
  product_name: string | null;
  drug_schedule: string | null;
  cold_chain: boolean;
  batch_number: string;
  expiry_date: string;
  qty_available: number;
  qty_reserved: number;
  supplier_name: string | null;
  supplier_licence_no: string | null;
  supplier_invoice_no: string | null;
  supplier_invoice_date: string | null;
  provenance_source: 'file' | 'feed' | 'portal' | null;
  provenance_recorded_at: string | null;
}

export interface ProvenanceFilter { q?: string; missing?: boolean }

export const provenanceKeys = { admin: (f: ProvenanceFilter) => ['partner-provenance', f] as const };

export async function fetchProvenance(f: ProvenanceFilter) {
  const { data } = await api.get('/partner-provenance', { params: { ...(f.q ? { q: f.q } : {}), ...(f.missing ? { missing: '1' } : {}) } });
  return data.data as { required_for_h1_and_cold_chain: boolean; batches: BatchProvenance[] };
}

export const SOURCE_LABELS: Record<NonNullable<BatchProvenance['provenance_source']>, string> = { file: 'Stock file', feed: 'Live feed', portal: 'Portal' };
