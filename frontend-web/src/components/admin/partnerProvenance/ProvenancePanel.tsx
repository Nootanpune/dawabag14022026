'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import { formatDateTimeIST } from '@/lib/dates';
import { SOURCE_LABELS, fetchProvenance, provenanceKeys } from '@/lib/partnerProvenance/api';

/**
 * Partner batch suppliers (Sprint 39; C-02 licensed suppliers, C-28 recall tracing): for each
 * partner batch, the supplier, its licence and the purchase invoice the partner gave — recorded
 * once and never changed. Optional for now; Settings can make it required for Schedule H1 and
 * cold-chain batches.
 */
export default function ProvenancePanel() {
  const [q, setQ] = useState('');
  const [missing, setMissing] = useState(false);
  const { data, isLoading, error, refetch, isFetching } = useQuery({ queryKey: provenanceKeys.admin({ q, missing }), queryFn: () => fetchProvenance({ q, missing }) });
  const rows = data?.batches ?? [];
  return (
    <div>
      <PageHeader title="Partner batch suppliers" onRefresh={() => refetch()} refreshing={isFetching}
        subtitle={data ? (data.required_for_h1_and_cold_chain
          ? 'Required for Schedule H1 and cold-chain batches (Settings). Kept as first recorded.'
          : 'Optional for now (Settings can make it required for Schedule H1 and cold-chain batches). Kept as first recorded.') : undefined} />
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <label htmlFor="pv-q" className="sr-only">Find</label>
        <input id="pv-q" type="search" className="input max-w-xs" placeholder="Medicine, supplier or invoice" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="text-sm inline-flex items-center gap-2"><input type="checkbox" checked={missing} onChange={(e) => setMissing(e.target.checked)} /> Only batches without details</label>
      </div>
      <QueryState isLoading={isLoading} error={error} isEmpty={!rows.length} emptyText="No partner batches." />
      {rows.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                <th className="px-3 py-2">Partner</th><th className="px-3 py-2">Medicine / batch</th><th className="px-3 py-2">Supplier</th>
                <th className="px-3 py-2">Purchase invoice</th><th className="px-3 py-2">Recorded</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.partner_inventory_id} className="border-b border-gray-50 align-top" data-testid="provenance-row">
                  <td className="px-3 py-2 text-xs">{b.partner_name}</td>
                  <td className="px-3 py-2"><p className="font-medium">{b.product_name ?? '—'}</p>
                    <p className="text-xs text-gray-500">Batch {b.batch_number} · exp {b.expiry_date}{b.drug_schedule === 'Schedule H1' ? ' · H1' : ''}{b.cold_chain ? ' · cold chain' : ''}</p></td>
                  <td className="px-3 py-2 text-xs">{b.supplier_name ?? <span className="text-gray-400">Not given</span>}{b.supplier_licence_no && <p className="text-gray-500">DL {b.supplier_licence_no}</p>}</td>
                  <td className="px-3 py-2 text-xs">{b.supplier_invoice_no ?? '—'}{b.supplier_invoice_date ? ` · ${b.supplier_invoice_date}` : ''}</td>
                  <td className="px-3 py-2 text-xs text-gray-600">{b.provenance_recorded_at ? `${formatDateTimeIST(b.provenance_recorded_at)} · ${SOURCE_LABELS[b.provenance_source!]}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
