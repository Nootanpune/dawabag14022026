'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import { formatDateTimeIST } from '@/lib/dates';
import { drillKeys, fetchDrills, seconds } from '@/lib/recallDrills/api';
import StartDrillForm from './StartDrillForm';

/** Mock recall drills (Sprint 40; O15; C-28): run one, and the history of every drill. */
export default function DrillHistory() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({ queryKey: drillKeys.list, queryFn: fetchDrills });
  const rows = data ?? [];
  return (
    <div>
      <PageHeader title="Mock recall drills" onRefresh={() => refetch()} refreshing={isFetching}
        subtitle="Practise a recall: how fast can we name every buyer, partner and unit of a batch? Recorded with time-to-trace (Rulebook C-28)." />
      <StartDrillForm />
      <h2 className="text-sm font-semibold text-gray-800 mb-2">Drill history</h2>
      <QueryState isLoading={isLoading} error={error} isEmpty={!rows.length} emptyText="No drill yet." />
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b">
                <th className="py-2 pr-2">Drill</th><th className="py-2 pr-2">Batch</th><th className="py-2 pr-2">Started</th>
                <th className="py-2 pr-2">Time to trace</th><th className="py-2 pr-2">Found</th><th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="border-b border-gray-100" data-testid="drill-row">
                  <td className="py-2 pr-2"><Link href={`/admin/recall-drills/${d.id}`} className="text-brand-700 underline font-mono">{d.drill_no}</Link></td>
                  <td className="py-2 pr-2">{d.product_name} <span className="font-mono text-xs">{d.batch_number}</span></td>
                  <td className="py-2 pr-2 text-xs">{formatDateTimeIST(d.started_at)}{d.started_by_name ? ` · ${d.started_by_name}` : ''}</td>
                  <td className="py-2 pr-2">{seconds(d.time_to_trace_ms)}</td>
                  <td className="py-2 pr-2 text-xs">{d.summary.orders} order(s) · {d.summary.buyers} buyer(s) · {d.summary.partners_involved} partner(s) · {d.summary.stock_on_hand} on hand</td>
                  <td className="py-2 text-xs">{d.closed_at ? 'Closed' : 'Open'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
