import { formatDateTimeIST } from '@/lib/dates';
import type { FeedStatus } from '@/lib/stockFeed';
import StaleBadge from './StaleBadge';

/** "Stock last updated <time>" for the partner and the admin, with what staleness does. */
export default function FeedStatusLine({ s }: { s: FeedStatus }) {
  if (s.mode !== 'live') return <p className="text-sm text-gray-600" data-testid="feed-status">Manual: stock is updated by uploading a file and applying it.</p>;
  return (
    <div className="space-y-1" data-testid="feed-status">
      <p className="text-sm">
        <span className="font-medium">Stock last updated:</span>{' '}
        <span data-testid="feed-last-updated">{s.last_taken_at ? formatDateTimeIST(s.last_taken_at, { zone: true }) : 'no snapshot received yet'}</span>
        {s.last_sequence != null && <span className="text-xs text-gray-500"> (snapshot #{s.last_sequence})</span>}
      </p>
      {s.stale ? (
        <p className="text-sm text-amber-900 flex flex-wrap items-center gap-2" role="alert">
          <StaleBadge lastAt={s.last_taken_at} short />
          No snapshot within {s.stale_after_minutes} minutes:{' '}
          {s.stale_policy === 'hide' ? 'this stock is not offered to buyers' : `only ${100 - s.stale_margin_pct}% of it is offered`} until the next one arrives.
        </p>
      ) : (
        <p className="text-xs text-gray-500">
          Snapshots expected at least every {s.stale_after_minutes} minutes. {s.held_for_orders > 0 && `${s.held_for_orders} pack(s) held back for Dawabag orders not yet dispatched.`}
        </p>
      )}
    </div>
  );
}
