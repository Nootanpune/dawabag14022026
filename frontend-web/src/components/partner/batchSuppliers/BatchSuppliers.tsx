'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { SOURCE_LABELS, fetchMyBatchProvenance, partnerProvenanceKeys, type BatchProvenance } from '@/lib/partnerProvenance/api';
import AddSupplierDialog from './AddSupplierDialog';

/**
 * The partner's batches and who supplied each (Sprint 39 provenance; Sprint 40 page). Details
 * recorded from the stock file, the live feed or here are read-only; a batch with none can be
 * completed once (C-02 licensed suppliers, C-28 recall tracing, C-34 records kept).
 */
export default function BatchSuppliers() {
  const [q, setQ] = useState('');
  const [missing, setMissing] = useState(false);
  const [adding, setAdding] = useState<BatchProvenance | null>(null);
  const dq = useDebouncedValue(q, 300);
  const { data, isLoading, error, refetch, isFetching } = useQuery({ queryKey: partnerProvenanceKeys.mine(dq, missing), queryFn: () => fetchMyBatchProvenance(dq, missing) });
  const rows = data ?? [];
  return (
    <div>
      <PageHeader title="Batch suppliers" onRefresh={() => refetch()} refreshing={isFetching}
        subtitle="Where you bought each batch. Dawabag sees these details for recalls. Once recorded they cannot be changed; add them where they are missing." />
      <div className="flex flex-wrap items-center gap-3 mb-3 text-sm">
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={missing} onChange={(e) => setMissing(e.target.checked)} /> Only batches with no supplier details</label>
        <label htmlFor="bs-q" className="sr-only">Find</label>
        <input id="bs-q" type="search" className="input max-w-xs ml-auto" placeholder="Product, batch or supplier" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <QueryState isLoading={isLoading} error={error} isEmpty={!rows.length} emptyText="No batches here." />
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b">
                <th className="py-2 pr-2">Product</th><th className="py-2 pr-2">Batch</th><th className="py-2 pr-2">Supplier</th>
                <th className="py-2 pr-2">Supplier licence</th><th className="py-2 pr-2">Purchase invoice</th><th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const recorded = !!b.provenance_source;
                return (
                  <tr key={b.partner_inventory_id} className="border-b border-gray-100" data-testid="batch-supplier-row">
                    <td className="py-2 pr-2"><p className="font-medium">{b.product_name ?? '—'}</p><p className="text-xs text-gray-500">{b.drug_schedule}{b.cold_chain ? ' · cold chain' : ''}</p></td>
                    <td className="py-2 pr-2 font-mono text-xs">{b.batch_number}<p className="font-sans text-gray-500">Exp {b.expiry_date}</p></td>
                    <td className="py-2 pr-2">{b.supplier_name ?? <span className="text-gray-400">—</span>}</td>
                    <td className="py-2 pr-2 text-xs">{b.supplier_licence_no ?? '—'}</td>
                    <td className="py-2 pr-2 text-xs">{b.supplier_invoice_no ?? '—'}{b.supplier_invoice_date ? ` · ${b.supplier_invoice_date}` : ''}</td>
                    <td className="py-2 text-right text-xs whitespace-nowrap">
                      {recorded ? <span className="text-gray-500">Recorded ({SOURCE_LABELS[b.provenance_source!]}) · read-only</span>
                        : <button type="button" className="btn-outline text-xs py-1" onClick={() => setAdding(b)}>Add supplier details</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {adding && <AddSupplierDialog batch={adding} onClose={() => setAdding(null)} />}
    </div>
  );
}
