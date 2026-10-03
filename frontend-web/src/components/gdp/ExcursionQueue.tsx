'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import { useAuthStore } from '@/store/authStore';
import { formatDateTimeIST } from '@/lib/dates';
import { DISPOSITION_LABELS, fetchPendingExcursions, gdpKeys, type PendingExcursion } from '@/lib/gdp/api';
import GdpStatusBadge from './GdpStatusBadge';
import DispositionDialog from './DispositionDialog';

/**
 * Cold-chain excursions waiting for a pharmacist (Sprint 40, C-25): each holds its batch
 * until released, quarantined (still held) or destroyed. Staff see Dawabag's (they decide)
 * and partners' (read-only: the partner's own pharmacist decides); a partner sees its own.
 */
export default function ExcursionQueue({ portal }: { portal: boolean }) {
  const role = useAuthStore((s) => s.user?.role);
  const [open, setOpen] = useState<PendingExcursion | null>(null);
  const { data, isLoading, error, refetch, isFetching } = useQuery({ queryKey: gdpKeys.pending(portal ? 'portal' : 'all'), queryFn: () => fetchPendingExcursions(portal) });
  const rows = data ?? [];
  const mayDecide = (e: PendingExcursion) => (portal ? true : role === 'pharmacist_rx' && !!e.batch_id);
  return (
    <div>
      <PageHeader title="Excursions waiting for a pharmacist" onRefresh={() => refetch()} refreshing={isFetching}
        subtitle={portal ? 'Your batches on hold after a cold-chain excursion. Your registered pharmacist decides: release, quarantine or destroy.'
          : 'Batches on hold after a cold-chain excursion. A Dawabag pharmacist with a valid registration decides on Dawabag\'s batches; a partner\'s own pharmacist on its batches.'}
        actions={<Link href={portal ? '/partner/gdp' : '/staff/gdp'} className="btn-outline text-sm">All batches</Link>} />
      <QueryState isLoading={isLoading} error={error} isEmpty={!rows.length} emptyText="No excursion is waiting." />
      {rows.length > 0 && (
        <ul className="space-y-2" aria-label="Excursions waiting">
          {rows.map((e) => (
            <li key={e.id} className="card flex flex-wrap items-start justify-between gap-3" data-testid="excursion-row">
              <div className="text-sm">
                <p className="font-medium">{e.product_name} <span className="font-mono text-xs">batch {e.batch_number}</span>
                  {!portal && <span className="text-xs text-gray-500"> · {e.batch_id ? 'Dawabag' : e.partner_name}</span>}</p>
                <p className="text-gray-700">{e.notes}{e.temperature_c !== null ? ` (${e.temperature_c} °C)` : ''}</p>
                <p className="text-xs text-gray-500">{formatDateTimeIST(e.recorded_at)} · {e.recorded_by_name ?? e.source} · waiting {e.hours_waiting} h · {e.qty_available} in stock
                  {e.last_disposition ? ` · last decision: ${DISPOSITION_LABELS[e.last_disposition]}` : ''}</p>
              </div>
              <div className="flex items-center gap-2">
                <GdpStatusBadge status={e.batch_gdp_status} />
                <Link className="text-xs underline text-gray-700" href={portal ? `/partner/gdp/${e.partner_inventory_id}` : `/staff/gdp/${e.batch_id ? 'own' : 'partner'}/${e.batch_id ?? e.partner_inventory_id}`}>Log</Link>
                {mayDecide(e) && <button type="button" className="btn-primary text-sm py-1" onClick={() => setOpen(e)}>Decide…</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {!portal && role !== 'pharmacist_rx' && rows.length > 0 && <p className="text-xs text-gray-500 mt-3">Only a Dawabag pharmacist can record a decision.</p>}
      {open && <DispositionDialog portal={portal} excursion={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
