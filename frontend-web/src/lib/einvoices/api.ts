// GST e-invoices (IRN from the IRP) — /api/v1/einvoices, admins only (C-31).
// The server registers B2B invoices and credit notes; the UI lists them and can retry.
import api from '../api';
import type { Einvoice, EinvoiceDocType, EinvoiceList, EinvoiceStatus } from './types';

export const einvoiceKeys = {
  all: ['einvoices'] as const,
  list: (status: EinvoiceStatus | '') => ['einvoices', status] as const,
};

export const DOC_TYPE_LABELS: Record<EinvoiceDocType, string> = { INV: 'Invoice', CRN: 'Credit note' };

export const EINVOICE_TABS: readonly { value: EinvoiceStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'failed', label: 'Failed' },
  { value: 'generated', label: 'Generated' },
  { value: 'cancelled', label: 'Cancelled' },
];

export async function fetchEinvoices(status: EinvoiceStatus | ''): Promise<EinvoiceList> {
  const { data } = await api.get('/einvoices', { params: status ? { status } : undefined });
  const d = data.data ?? {};
  return { einvoices: d.einvoices ?? [], counts: d.counts ?? {}, enabled: d.enabled === true };
}

/** Try the IRP again after fixing the data; the row comes back generated or still failed with a new reason. */
export async function retryEinvoice(id: string): Promise<Einvoice> {
  const { data } = await api.post(`/einvoices/${id}/retry`, undefined, { timeout: 60000 });
  return data.data;
}

/** "abcd1234…wxyz" for a 64-character IRN; the full value goes in the title attribute. */
export function shortIrn(irn: string | null): string {
  if (!irn) return '—';
  return irn.length > 16 ? `${irn.slice(0, 8)}…${irn.slice(-6)}` : irn;
}
