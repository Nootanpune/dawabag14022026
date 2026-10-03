'use client';
import { useQuery } from '@tanstack/react-query';
import BackLink from '@/components/admin/BackLink';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import { formatDateTimeIST } from '@/lib/dates';
import { DISPOSITION_LABELS, EVENT_LABELS, fetchGdpLog, gdpKeys, type BatchKind } from '@/lib/gdp/api';
import GdpStatusBadge from './GdpStatusBadge';
import RecordEventForm from './RecordEventForm';

/** One batch's GDP log, oldest first, with the form to add a record (Sprint 40, C-25, C-34). */
export default function GdpBatchLog({ portal, kind, id, canRecord }: { portal: boolean; kind: BatchKind; id: string; canRecord: boolean }) {
  const { data, isLoading, error, refetch, isFetching } = useQuery({ queryKey: gdpKeys.log(kind, id), queryFn: () => fetchGdpLog(portal, kind, id) });
  const b = data?.batch;
  return (
    <div>
      <BackLink href={portal ? '/partner/gdp' : '/staff/gdp'} label="GDP records" />
      <QueryState isLoading={isLoading} error={error} isEmpty={false} emptyText="" />
      {b && data && (
        <>
          <PageHeader title={`${b.product_name} — batch ${b.batch_number}`} onRefresh={() => refetch()} refreshing={isFetching}
            subtitle={<>{b.kind === 'own' ? 'Dawabag' : b.partner_name} · expiry {b.expiry_date} · {b.qty_available} in stock
              {b.cold_chain ? ' · cold chain (2–8 °C)' : ''}{b.storage_instructions ? ` · ${b.storage_instructions}` : ''}</>}
            actions={<GdpStatusBadge status={b.gdp_status} />} />
          {b.gdp_status !== 'ok' && (
            <p className="mb-4 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg p-3" role="alert">
              This batch is not sold, packed or dispatched until a pharmacist releases it (Excursions waiting).
            </p>
          )}
          <div className="grid lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 overflow-x-auto">
              <table className="w-full text-sm" aria-label="GDP log">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b">
                    <th className="py-2 pr-2">When</th><th className="py-2 pr-2">Event</th><th className="py-2 pr-2">°C</th><th className="py-2 pr-2">Details</th><th className="py-2">By</th>
                  </tr>
                </thead>
                <tbody>
                  {data.records.map((r) => (
                    <tr key={r.id} className="border-b border-gray-100 align-top" data-testid="gdp-log-row">
                      <td className="py-2 pr-2 text-xs whitespace-nowrap">{formatDateTimeIST(r.recorded_at)}</td>
                      <td className="py-2 pr-2">
                        <span className={r.event_kind === 'excursion' ? 'font-semibold text-red-700' : ''}>{EVENT_LABELS[r.event_kind] ?? r.event_kind}</span>
                        {r.event_kind === 'excursion' && r.open && <span className="block text-xs text-red-700">waiting for a pharmacist</span>}
                      </td>
                      <td className="py-2 pr-2 text-xs">{r.temperature_c ?? '—'}</td>
                      <td className="py-2 pr-2 text-xs text-gray-700 max-w-md">
                        {r.disposition && <p className="font-medium">{DISPOSITION_LABELS[r.disposition]} — {r.pharmacist_name} ({r.pharmacist_reg_no})</p>}
                        {r.justification && <p>{r.justification}</p>}
                        {r.storage_condition && <p>Storage: {r.storage_condition}</p>}
                        {r.location && <p>Location: {r.location}</p>}
                        {r.notes && <p>{r.notes}</p>}
                        {r.stock_adjustment_id && <p className="text-gray-500">Write-off raised for the destruction register</p>}
                      </td>
                      <td className="py-2 text-xs text-gray-600">{r.recorded_by_name ?? r.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.records.length && <p className="text-sm text-gray-500 py-4">No records yet.</p>}
            </div>
            {canRecord && <RecordEventForm portal={portal} batchId={b.id} coldChain={b.cold_chain} />}
          </div>
        </>
      )}
    </div>
  );
}
