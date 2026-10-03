// Mock recall drills (Sprint 40; O15; C-28): the server runs the real trace of a batch
// without contacting anyone and keeps the drill record; the report is built on demand.
import api from '../api';
import { downloadFromApi } from '../download';

export interface DrillSummary {
  orders: number;
  buyers: number;
  units_supplied: number;
  units_awaiting_dispatch: number;
  sold_by_dawabag: number;
  sold_by_partners: number;
  partners_involved: number;
  h1_entries: number;
  stock_on_hand: number;
  stock_locations: number;
}

export interface DrillListRow {
  id: string;
  drill_no: string;
  batch_number: string;
  scenario: string;
  started_at: string;
  time_to_trace_ms: number;
  summary: DrillSummary;
  closed_at: string | null;
  product_name: string;
  sku: string;
  started_by_name: string | null;
}

export interface DrillLine {
  order_id: string;
  order_number: string;
  order_status: string;
  ordered_at: string;
  quantity: number;
  shipment_status: string | null;
  seller_type: 'dawabag' | 'partner' | null;
  partner_name: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  awb_number: string | null;
  courier_partner: string | null;
  buyer_name: string | null;
  buyer_type: string | null;
  buyer_city: string | null;
  buyer_pincode: string | null;
}

export interface DrillDetail extends DrillListRow {
  traced_at: string;
  drug_schedule: string | null;
  conclusion: string | null;
  actions: string | null;
  closed_by_name: string | null;
  findings: {
    lines: DrillLine[];
    h1_entries: { id: string; register_key: string; entry_no: number | null; dispensed_at: string; quantity: number; patient_name: string; prescriber_name: string }[];
    stock: { holder: 'dawabag' | 'partner'; holder_name: string; location: string; qty_available: number; qty_reserved: number; is_recalled: boolean; gdp_status: string; expiry_date: string }[];
    suppliers: { holder: string; reference: string; supplier_name: string | null; supplier_invoice_no: string | null; supplier_invoice_date: string | null }[];
  };
}

export interface DrillableBatch { product_id: string; product_name: string; sku: string; batch_number: string; at_dawabag: boolean; partner_batches: number }

export const drillKeys = {
  all: ['recall-drills'] as const,
  list: ['recall-drills', 'list'] as const,
  one: (id: string) => ['recall-drills', 'one', id] as const,
  batches: (q: string) => ['recall-drills', 'batches', q] as const,
};

export async function fetchDrills(): Promise<DrillListRow[]> {
  const { data } = await api.get('/recall-drills');
  return data.data?.drills ?? [];
}
export async function fetchDrill(id: string): Promise<DrillDetail> {
  const { data } = await api.get(`/recall-drills/${id}`);
  return data.data;
}
export async function fetchDrillableBatches(q: string): Promise<DrillableBatch[]> {
  const { data } = await api.get('/recall-drills/batches', { params: q ? { q } : {} });
  return data.data?.batches ?? [];
}
export async function startDrill(body: { product_id: string; batch_number: string; scenario: string }) {
  const { data } = await api.post('/recall-drills', body);
  return data.data as { id: string; drill_no: string; time_to_trace_ms: number; summary: DrillSummary };
}
export async function closeDrill(id: string, body: { conclusion: string; actions?: string | null }) {
  const { data } = await api.post(`/recall-drills/${id}/close`, body);
  return data.data;
}
export function downloadDrillReport(id: string, drillNo: string) {
  return downloadFromApi(`/recall-drills/${id}/report.pdf`, `${drillNo}.pdf`);
}

export const seconds = (ms: number) => `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
