'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ALERT_POLL_MS, fetchPartnerFeedAlerts, stockFeedKeys } from '@/lib/stockFeed';
import StaleBadge from './StaleBadge';
import UrgentBadge from './UrgentBadge';

/** Partner portal header: urgent count of live-feed items to check, and a stale warning. Polls the server. */
export function usePartnerFeedAlerts() {
  return useQuery({ queryKey: stockFeedKeys.partnerAlerts, queryFn: fetchPartnerFeedAlerts, refetchInterval: ALERT_POLL_MS, retry: false });
}

export default function PartnerFeedAlert() {
  const { data } = usePartnerFeedAlerts();
  if (!data || data.mode !== 'live' || (!data.waiting_checks && !data.stale)) return null;
  return (
    <Link href="/partner/stock-feed" className="flex items-center gap-2" aria-label="Open the live stock feed" data-testid="partner-feed-alert">
      <UrgentBadge count={data.waiting_checks} testId="header-urgent-badge" />
      {data.stale && <StaleBadge lastAt={data.last_taken_at} short />}
    </Link>
  );
}
