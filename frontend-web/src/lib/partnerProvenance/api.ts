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

// ── Partner portal: its own batches (Sprint 40) ──────────────────────────────
export const partnerProvenanceKeys = { mine: (q: string, missing: boolean) => ['partner', 'batch-provenance', q, missing] as const };

export async function fetchMyBatchProvenance(q: string, missing: boolean): Promise<BatchProvenance[]> {
  const { data } = await api.get('/partner/batch-provenance', { params: { ...(q ? { q } : {}), ...(missing ? { missing: '1' } : {}) } });
  return data.data?.batches ?? [];
}

export interface ProvenanceInput {
  supplier_name: string;
  supplier_licence_no: string;
  supplier_invoice_no: string;
  supplier_invoice_date: string;
}

/** Records the supplier details of a batch that has none yet; read-only afterwards (409). */
export async function addMyBatchProvenance(inventoryId: string, p: ProvenanceInput) {
  const clean = (v: string) => v.trim() || null;
  const { data } = await api.post(`/partner/batch-provenance/${inventoryId}`, {
    supplier_name: clean(p.supplier_name), supplier_licence_no: clean(p.supplier_licence_no),
    supplier_invoice_no: clean(p.supplier_invoice_no), supplier_invoice_date: clean(p.supplier_invoice_date) });
  return data.data;
}
