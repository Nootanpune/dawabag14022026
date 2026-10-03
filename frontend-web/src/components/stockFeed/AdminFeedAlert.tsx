'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { hasRole, MANAGER_ROLES } from '@/lib/admin/roles';
import { ALERT_POLL_MS, fetchAdminFeedAlerts, stockFeedKeys } from '@/lib/stockFeed';
import UrgentBadge from './UrgentBadge';

/** Admin header and menu: live-feed items waiting across partners, and stale feeds. Admins only; polls the server. */
export function useAdminFeedAlerts() {
  const role = useAuthStore((s) => s.user?.role);
  return useQuery({ queryKey: stockFeedKeys.adminAlerts, queryFn: fetchAdminFeedAlerts, refetchInterval: ALERT_POLL_MS, retry: false,
    enabled: hasRole(role, MANAGER_ROLES) });
}

export default function AdminFeedAlert() {
  const { data } = useAdminFeedAlerts();
  if (!data || (!data.waiting_checks && !data.stale_feeds)) return null;
  return (
    <Link href="/admin/stock-feeds" className="flex items-center gap-2" aria-label="Open live stock feeds" data-testid="admin-feed-alert">
      <UrgentBadge count={data.waiting_checks} testId="header-urgent-badge" />
      {data.stale_feeds > 0 && <span className="stale-badge">{data.stale_feeds} feed{data.stale_feeds === 1 ? '' : 's'} stale</span>}
    </Link>
  );
}
