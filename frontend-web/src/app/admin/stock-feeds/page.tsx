'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import CheckList from '@/components/stockFeed/CheckList';
import StaleBadge from '@/components/stockFeed/StaleBadge';
import UrgentBadge from '@/components/stockFeed/UrgentBadge';
import { formatDateTimeIST } from '@/lib/dates';
import { ALERT_POLL_MS, fetchAdminChecks, fetchAdminFeedAlerts, stockFeedKeys } from '@/lib/stockFeed';

/**
 * Sprint 37 — Admin → Live stock feeds: each partner on the live feed, when its stock was
 * last updated, stale feeds, and every item waiting for the partner's check (read-only:
 * the partner, as seller of record, decides; C-05).
 */
export default function AdminStockFeedsPage() {
  const alerts = useQuery({ queryKey: stockFeedKeys.adminAlerts, queryFn: fetchAdminFeedAlerts, refetchInterval: ALERT_POLL_MS });
  const checks = useQuery({ queryKey: stockFeedKeys.adminChecks(null), queryFn: () => fetchAdminChecks(null), refetchInterval: ALERT_POLL_MS });
  return (
    <div className="space-y-5">
      <PageHeader title="Live stock feeds" subtitle="Partners whose billing software sends stock automatically"
        onRefresh={() => { alerts.refetch(); checks.refetch(); }} refreshing={alerts.isFetching} />
      <QueryState isLoading={alerts.isLoading} error={alerts.error} isEmpty={!alerts.data?.partners.length}
        emptyText="No partner is on the live stock feed. Switch one on from its page under Partners." />
      {!!alerts.data?.partners.length && (
        <ul className="card p-0 divide-y divide-gray-100 text-sm" data-testid="feed-partner-list">
          {alerts.data.partners.map((p) => (
            <li key={p.partner_id} className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
              <Link href={`/admin/partners/${p.partner_id}`} className="font-medium text-brand-700 underline flex-1 min-w-[12rem]">{p.name}</Link>
              <span className="text-xs text-gray-600">
                {p.mode === 'live' ? `Stock last updated ${p.last_taken_at ? formatDateTimeIST(p.last_taken_at, { zone: true }) : 'never'}` : 'Manual'}
              </span>
              {p.stale && <StaleBadge lastAt={p.last_taken_at} short />}
              <UrgentBadge count={p.waiting} />
            </li>
          ))}
        </ul>
      )}
      <section className="space-y-2" aria-labelledby="admin-checks-heading">
        <div className="flex items-center gap-2">
          <h2 id="admin-checks-heading" className="text-base font-semibold">Waiting for the partner&apos;s check</h2>
          <UrgentBadge count={checks.data?.length ?? 0} testId="page-urgent-badge" />
        </div>
        <QueryState isLoading={checks.isLoading} error={checks.error} isEmpty={!checks.data?.length} emptyText="Nothing waits" />
        {!!checks.data?.length && <CheckList checks={checks.data} readOnly />}
      </section>
    </div>
  );
}
