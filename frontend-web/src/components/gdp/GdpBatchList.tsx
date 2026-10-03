'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Snowflake } from 'lucide-react';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatDateTimeIST } from '@/lib/dates';
import { GDP_STATUS_LABELS, fetchGdpBatches, gdpKeys, type GdpStatus } from '@/lib/gdp/api';
import GdpStatusBadge from './GdpStatusBadge';

const STATUSES: (GdpStatus | '')[] = ['', 'on_hold', 'quarantined', 'destroyed', 'ok'];

/**
 * Batches and their GDP standing (Sprint 40, C-25): Dawabag's store staff see Dawabag's and
 * partners' batches (portal = false); a partner sees its own (portal = true). Held batches
 * come first. Open a batch for its log and to record a reading.
 */
export default function GdpBatchList({ portal }: { portal: boolean }) {
  const [scope, setScope] = useState<'all' | 'own' | 'partner'>('all');
  const [status, setStatus] = useState<GdpStatus | ''>('');
  const [cold, setCold] = useState(false);
  const [q, setQ] = useState('');
  const dq = useDebouncedValue(q, 300);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: [...gdpKeys.batches(portal ? 'portal' : scope, status, dq, cold)],
    queryFn: () => fetchGdpBatches(portal, { scope, status, q: dq, cold }),
  });
  const rows = data ?? [];
  const href = (kind: string, id: string) => (portal ? `/partner/gdp/${id}` : `/staff/gdp/${kind}/${id}`);
  return (
    <div>
      <PageHeader title={portal ? 'GDP records of your batches' : 'GDP records by batch'} onRefresh={() => refetch()} refreshing={isFetching}
        subtitle={<>Storage checks, temperature readings and excursions per batch. A cold-chain excursion puts the batch <strong>on hold</strong> — not sold or
          dispatched — until {portal ? 'your registered pharmacist' : 'a Dawabag pharmacist'} decides (Rulebook C-25).</>}
        actions={<Link href={portal ? '/partner/gdp/excursions' : '/staff/gdp/excursions'} className="btn-outline text-sm">Excursions waiting</Link>} />
      <div className="flex flex-wrap items-end gap-2 mb-3 text-sm">
        {!portal && (
          <label className="block"><span className="block text-xs text-gray-600 mb-0.5">Whose</span>
            <select className="input py-1" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
              <option value="all">Dawabag and partners</option><option value="own">Dawabag</option><option value="partner">Partners</option>
            </select>
          </label>
        )}
        <label className="block"><span className="block text-xs text-gray-600 mb-0.5">Standing</span>
          <select className="input py-1" value={status} onChange={(e) => setStatus(e.target.value as GdpStatus | '')}>
            {STATUSES.map((s) => <option key={s || 'any'} value={s}>{s ? GDP_STATUS_LABELS[s] : 'Any'}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5 pb-1.5"><input type="checkbox" checked={cold} onChange={(e) => setCold(e.target.checked)} /> Cold chain only</label>
        <label htmlFor="gdp-q" className="sr-only">Find a batch</label>
        <input id="gdp-q" type="search" className="input max-w-xs ml-auto" placeholder="Product, SKU or batch" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <QueryState isLoading={isLoading} error={error} isEmpty={!rows.length} emptyText="No batches here." />
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b">
                <th className="py-2 pr-2">Product</th><th className="py-2 pr-2">Batch</th>{!portal && <th className="py-2 pr-2">Held by</th>}
                <th className="py-2 pr-2">Stock</th><th className="py-2 pr-2">GDP</th><th className="py-2 pr-2">Last record</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={`${b.kind}-${b.id}`} className="border-b border-gray-100" data-testid="gdp-batch-row">
                  <td className="py-2 pr-2"><p className="font-medium">{b.product_name}</p><p className="text-xs text-gray-500">{b.sku}</p></td>
                  <td className="py-2 pr-2">
                    <Link href={href(b.kind, b.id)} className="text-brand-700 underline font-mono">{b.batch_number}</Link>
                    {b.cold_chain && <Snowflake className="inline w-3.5 h-3.5 ml-1 text-sky-600" aria-label="Cold chain" />}
                    <p className="text-xs text-gray-500">Exp {b.expiry_date}{b.location ? ` · ${b.location}` : ''}</p>
                  </td>
                  {!portal && <td className="py-2 pr-2 text-xs">{b.kind === 'own' ? 'Dawabag' : b.partner_name}</td>}
                  <td className="py-2 pr-2 text-xs">{b.qty_available}{b.qty_reserved ? ` (${b.qty_reserved} reserved)` : ''}</td>
                  <td className="py-2 pr-2"><GdpStatusBadge status={b.gdp_status} /></td>
                  <td className="py-2 pr-2 text-xs text-gray-600">{b.last_record_at ? formatDateTimeIST(b.last_record_at) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
