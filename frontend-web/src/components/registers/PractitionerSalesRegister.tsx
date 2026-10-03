'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { downloadRegisterCsv, fetchRegister } from '@/lib/practitioner/admin';
import { certificateLink, practitionerKeys, writtenOrderLink } from '@/lib/practitioner/api';
import { normaliseBlobError } from '@/lib/download';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { daysAgoIST, todayIST } from '@/lib/dates';
import { formatPrice } from '@/lib/utils';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';

/**
 * "Sales to doctors and medical institutions" (Sprint 44) — the records the FDA Maharashtra
 * circular Drug/Wholesalers Memo./16/2026/1 asks for: bill, buyer and registration (number,
 * council, valid till) with the certificate copy, the signed written order (r.65(9)(b)), what was
 * supplied (batches, quantities) and the supervising pharmacist (r.64(2)). Admin: every seller;
 * partner: its own sales. Built by the server on request; links open for 5 minutes and are logged.
 */
export default function PractitionerSalesRegister({ scope }: { scope: 'admin' | 'partner' }) {
  const [from, setFrom] = useState(daysAgoIST(30));
  const [to, setTo] = useState(todayIST());
  const [downloading, setDownloading] = useState(false);
  const valid = !!from && !!to && from <= to;
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: practitionerKeys.register(scope, from, to), queryFn: () => fetchRegister(scope, from, to), enabled: valid,
  });
  const open = async (get: () => Promise<string>) => {
    try { window.open(await get(), '_blank', 'noopener'); } catch (err) { toast.error(getApiErrorMessage(err, 'Could not open the document')); }
  };
  const download = async () => {
    setDownloading(true);
    try { await downloadRegisterCsv(scope, from, to); } catch (err) {
      toast.error(getApiErrorMessage(await normaliseBlobError(err), 'Could not download the register'));
    } finally { setDownloading(false); }
  };
  return (
    <div>
      <PageHeader title="Sales to doctors and medical institutions" onRefresh={() => refetch()} refreshing={isFetching}
        subtitle={scope === 'admin'
          ? 'Every invoiced sale to a doctor or institution: registration and certificate, signed written order, batches and the pharmacist who approved it.'
          : 'Your invoiced sales to doctors and institutions — keep them up to date for the drugs inspector (FDA circular 16/2026).'} />
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="text-sm">
          <span className="block text-xs font-medium text-gray-600 mb-1">From</span>
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="input py-1.5" />
        </label>
        <label className="text-sm">
          <span className="block text-xs font-medium text-gray-600 mb-1">To</span>
          <input type="date" value={to} min={from} max={todayIST()} onChange={(e) => setTo(e.target.value)} className="input py-1.5" />
        </label>
        <button onClick={download} disabled={!valid || downloading} className="btn-outline text-sm inline-flex items-center gap-1 disabled:opacity-50">
          {downloading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <FileDown className="w-4 h-4" aria-hidden="true" />} Download CSV
        </button>
      </div>
      <QueryState isLoading={isLoading} error={error} isEmpty={!!data && data.length === 0} emptyText="No sales to doctors or institutions in this period." />
      {!!data?.length && (
        <div className="overflow-x-auto card p-0">
          <table className="min-w-full text-xs" data-testid="practitioner-register">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="p-2">Date / invoice</th><th className="p-2">Buyer</th><th className="p-2">Registration</th>
                <th className="p-2">Written order</th><th className="p-2">Item / batch</th><th className="p-2">Qty</th>
                <th className="p-2">Value</th><th className="p-2">Pharmacist</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map((r, i) => (
                <tr key={`${r.invoice_number}-${i}`}>
                  <td className="p-2 whitespace-nowrap">{r.invoice_date}<br /><span className="text-gray-500">{r.invoice_number}</span>
                    {scope === 'admin' && <><br /><span className="text-gray-500">{r.seller}</span></>}</td>
                  <td className="p-2">{r.buyer_name ?? '—'}<br /><span className="text-gray-500">{r.buyer_kind === 'institution' ? `Institution${r.institution ? `: ${r.institution}` : ''}` : 'Doctor'}</span></td>
                  <td className="p-2">{r.registration_number ?? '—'}<br /><span className="text-gray-500">{r.council ?? ''}{r.registration_valid_till ? `, valid till ${r.registration_valid_till}` : ''}</span>
                    {r.certificate_on_file && r.written_order_ids[0] && (
                      <><br /><button type="button" className="text-brand-700 hover:underline" onClick={() => open(() => certificateLink(r.written_order_ids[0]))}>Certificate</button></>
                    )}</td>
                  <td className="p-2">{r.written_order_ids.length ? r.written_order_ids.map((id, n) => (
                    <button key={id} type="button" className="block text-brand-700 hover:underline" onClick={() => open(() => writtenOrderLink(id))}>
                      Written order{r.written_order_ids.length > 1 ? ` ${n + 1}` : ''}
                    </button>)) : <span className="text-red-700">none</span>}</td>
                  <td className="p-2">{r.product_name}<br /><span className="text-gray-500">{r.batch_number ?? '—'}{r.expiry ? ` · exp ${r.expiry}` : ''}</span></td>
                  <td className="p-2 tabular-nums">{r.quantity}</td>
                  <td className="p-2 tabular-nums">{formatPrice(r.line_total_paise)}</td>
                  <td className="p-2">{r.pharmacist_name ?? '—'}<br /><span className="text-gray-500">{r.pharmacist_reg_no ?? ''}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
