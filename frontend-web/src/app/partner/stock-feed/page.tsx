'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import CheckList from '@/components/stockFeed/CheckList';
import FeedStatusLine from '@/components/stockFeed/FeedStatusLine';
import UrgentBadge from '@/components/stockFeed/UrgentBadge';
import { ALERT_POLL_MS, fetchPartnerChecks, fetchPartnerFeed, stockFeedKeys } from '@/lib/stockFeed';

/**
 * Sprint 37 — the partner's live stock feed: when its billing software last sent stock,
 * and the items that wait for a person (URGENT). Quantities of linked, listed products
 * apply by themselves (owner decision 2026-10-03).
 */
export default function PartnerStockFeedPage() {
  const status = useQuery({ queryKey: stockFeedKeys.partnerStatus, queryFn: fetchPartnerFeed, refetchInterval: ALERT_POLL_MS });
  const checks = useQuery({ queryKey: stockFeedKeys.partnerChecks, queryFn: fetchPartnerChecks, refetchInterval: ALERT_POLL_MS,
    enabled: status.data?.mode === 'live' });
  const s = status.data;
  return (
    <div className="space-y-5">
      <PageHeader title="Live stock feed" subtitle="Stock sent by your billing software every few minutes"
        onRefresh={() => { status.refetch(); checks.refetch(); }} refreshing={status.isFetching} />
      <QueryState isLoading={status.isLoading} error={status.error} isEmpty={false} emptyText="" />
      {s && (
        <section className="card space-y-2">
          <FeedStatusLine s={s} />
          {s.mode !== 'live' && (
            <p className="text-sm text-gray-600">
              Live mode is off. Dawabag&apos;s admin can switch it on once your billing software&apos;s connector is installed.
              Until then, <Link href="/partner/stock-import" className="text-brand-700 underline">upload your stock file</Link>.
            </p>
          )}
        </section>
      )}
      {s?.mode === 'live' && (
        <section className="space-y-2" aria-labelledby="checks-heading">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="checks-heading" className="text-base font-semibold">Waiting for your check</h2>
            <UrgentBadge count={checks.data?.length ?? s.waiting_checks} testId="page-urgent-badge" />
          </div>
          <p className="text-xs text-gray-600 max-w-2xl">
            These are not on sale on Dawabag until someone checks them: new products, items you do not list yet, price or MRP changes,
            later expiry dates and new refrigerated batches. Quantities of everything else are already updated.
          </p>
          <QueryState isLoading={checks.isLoading} error={checks.error} isEmpty={!checks.data?.length} emptyText="Nothing waits for a check" />
          {!!checks.data?.length && <CheckList checks={checks.data} />}
        </section>
      )}
    </div>
  );
}
