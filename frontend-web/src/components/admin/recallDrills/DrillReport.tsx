'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Printer } from 'lucide-react';
import { toast } from 'sonner';
import BackLink from '@/components/admin/BackLink';
import QueryState from '@/components/admin/QueryState';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { formatDateTimeIST } from '@/lib/dates';
import { closeDrill, downloadDrillReport, drillKeys, fetchDrill, seconds } from '@/lib/recallDrills/api';

const Stat = ({ label, value }: { label: string; value: number | string }) => (
  <div className="rounded-lg border border-gray-200 p-3"><p className="text-xs text-gray-500">{label}</p><p className="text-lg font-semibold" data-testid={`drill-stat-${label}`}>{value}</p></div>
);

/** The drill report, printable, built from the server's record (Sprint 40, C-28). */
export default function DrillReport({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const { data: d, isLoading, error } = useQuery({ queryKey: drillKeys.one(id), queryFn: () => fetchDrill(id) });
  const [conclusion, setConclusion] = useState('');
  const [actions, setActions] = useState('');
  const close = useMutation({
    mutationFn: () => closeDrill(id, { conclusion: conclusion.trim(), actions: actions.trim() || null }),
    onSuccess: () => { toast.success('Drill closed'); queryClient.invalidateQueries({ queryKey: drillKeys.all }); },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Could not close the drill')),
  });
  const pdf = useMutation({ mutationFn: () => downloadDrillReport(id, d!.drill_no), onError: (e) => toast.error(getApiErrorMessage(e, 'Could not download')) });
  return (
    <div>
      <div className="print:hidden"><BackLink href="/admin/recall-drills" label="Recall drills" /></div>
      <QueryState isLoading={isLoading} error={error} isEmpty={false} emptyText="" />
      {d && (
        <article aria-labelledby="drill-title">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h1 id="drill-title" className="text-xl font-semibold">Mock recall drill {d.drill_no}</h1>
              <p className="text-sm text-gray-600">{d.product_name} ({d.sku}) · batch <span className="font-mono">{d.batch_number}</span></p>
              <p className="text-xs text-gray-500">Trace only — no buyer, partner or regulator was contacted (C-28)</p>
            </div>
            <div className="flex gap-2 print:hidden">
              <button type="button" className="btn-outline text-sm inline-flex items-center gap-1" onClick={() => window.print()}><Printer className="w-4 h-4" /> Print</button>
              <button type="button" className="btn-outline text-sm inline-flex items-center gap-1" onClick={() => pdf.mutate()} disabled={pdf.isPending}><Download className="w-4 h-4" /> PDF</button>
            </div>
          </div>
          <dl className="text-sm grid sm:grid-cols-2 gap-x-6 gap-y-1 mb-4">
            <div><dt className="inline text-gray-500">Scenario: </dt><dd className="inline">{d.scenario}</dd></div>
            <div><dt className="inline text-gray-500">Started: </dt><dd className="inline">{formatDateTimeIST(d.started_at)}{d.started_by_name ? ` by ${d.started_by_name}` : ''}</dd></div>
            <div><dt className="inline text-gray-500">Time to trace: </dt><dd className="inline font-semibold" data-testid="drill-time">{seconds(d.time_to_trace_ms)}</dd></div>
            <div><dt className="inline text-gray-500">Traced: </dt><dd className="inline">{formatDateTimeIST(d.traced_at)}</dd></div>
          </dl>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-6">
            <Stat label="Orders" value={d.summary.orders} /><Stat label="Buyers" value={d.summary.buyers} />
            <Stat label="Partners" value={d.summary.partners_involved} /><Stat label="H1 entries" value={d.summary.h1_entries} />
            <Stat label="On hand" value={d.summary.stock_on_hand} />
          </div>
          <h2 className="text-sm font-semibold mb-2">Orders and shipments</h2>
          <div className="overflow-x-auto mb-6">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-gray-500 border-b"><th className="py-1 pr-2">Order</th><th className="py-1 pr-2">Buyer</th><th className="py-1 pr-2">Qty</th><th className="py-1 pr-2">Seller</th><th className="py-1">Shipment</th></tr></thead>
              <tbody>
                {d.findings.lines.map((l) => (
                  <tr key={`${l.order_id}-${l.order_number}-${l.quantity}-${l.seller_type}`} className="border-b border-gray-100" data-testid="drill-line">
                    <td className="py-1 pr-2 font-mono text-xs">{l.order_number}</td>
                    <td className="py-1 pr-2">{l.buyer_name ?? '—'} <span className="text-xs text-gray-500">({l.buyer_type ?? '—'}, {l.buyer_city} {l.buyer_pincode})</span></td>
                    <td className="py-1 pr-2">{l.quantity}</td>
                    <td className="py-1 pr-2">{l.seller_type === 'partner' ? l.partner_name : 'Dawabag'}</td>
                    <td className="py-1 text-xs">{l.shipment_status ?? 'not shipped'}{l.dispatched_at ? ` · ${formatDateTimeIST(l.dispatched_at)}` : ''}{l.awb_number ? ` · AWB ${l.awb_number}` : ''}</td>
                  </tr>
                ))}
                {!d.findings.lines.length && <tr><td colSpan={5} className="py-2 text-gray-500">No order used this batch.</td></tr>}
              </tbody>
            </table>
          </div>
          <h2 className="text-sm font-semibold mb-2">Stock on hand by location</h2>
          <ul className="text-sm mb-6 list-disc pl-5">
            {d.findings.stock.map((s, i) => <li key={i}>{s.holder_name} · {s.location} · {s.qty_available} available ({s.qty_reserved} reserved) · expiry {s.expiry_date}{s.is_recalled ? ' · RECALLED' : ''}{s.gdp_status !== 'ok' ? ` · GDP ${s.gdp_status}` : ''}</li>)}
            {!d.findings.stock.length && <li className="text-gray-500">None</li>}
          </ul>
          <h2 className="text-sm font-semibold mb-2">Schedule H1 register entries</h2>
          <ul className="text-sm mb-6 list-disc pl-5">
            {d.findings.h1_entries.map((h) => <li key={h.id}>{h.register_key} #{h.entry_no ?? '—'} · {formatDateTimeIST(h.dispensed_at)} · qty {h.quantity} · {h.patient_name} · {h.prescriber_name}</li>)}
            {!d.findings.h1_entries.length && <li className="text-gray-500">None</li>}
          </ul>
          <h2 className="text-sm font-semibold mb-2">Where the batch came from</h2>
          <ul className="text-sm mb-6 list-disc pl-5">
            {d.findings.suppliers.map((s, i) => <li key={i}>{s.holder === 'dawabag' ? `Dawabag ${s.reference}` : `Partner ${s.reference}`} · {s.supplier_name ?? '—'} · invoice {s.supplier_invoice_no ?? '—'} {s.supplier_invoice_date ?? ''}</li>)}
            {!d.findings.suppliers.length && <li className="text-gray-500">No supplier record.</li>}
          </ul>
          <h2 className="text-sm font-semibold mb-2">Close-out</h2>
          {d.closed_at ? (
            <div className="text-sm"><p>Closed {formatDateTimeIST(d.closed_at)}{d.closed_by_name ? ` by ${d.closed_by_name}` : ''}</p><p>Conclusion: {d.conclusion}</p>{d.actions && <p>Actions: {d.actions}</p>}</div>
          ) : (
            <div className="card text-sm print:hidden max-w-2xl">
              <label className="block mb-2"><span className="block font-medium text-gray-700 mb-1">Conclusion (what went well, what was missing)</span>
                <textarea className="input" rows={2} value={conclusion} onChange={(e) => setConclusion(e.target.value)} /></label>
              <label className="block mb-2"><span className="block font-medium text-gray-700 mb-1">Actions (optional)</span>
                <textarea className="input" rows={2} value={actions} onChange={(e) => setActions(e.target.value)} /></label>
              <button type="button" className="btn-primary text-sm disabled:opacity-50" disabled={conclusion.trim().length < 10 || close.isPending} onClick={() => close.mutate()}>Close the drill</button>
              <p className="text-xs text-gray-500 mt-1">The traced record cannot be changed; the close-out is added once.</p>
            </div>
          )}
        </article>
      )}
    </div>
  );
}
