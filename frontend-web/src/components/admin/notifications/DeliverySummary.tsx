import type { DeliveryCount } from '@/lib/notifications/types';
import { DELIVERY_CHANNELS } from '@/lib/notifications/api';
import { cn } from '@/lib/utils';

/** Sent / failed / skipped counts per channel over the last 7 days (counted by the server). */
export default function DeliverySummary({ counts }: { counts: DeliveryCount[] }) {
  const n = (channel: string, status: string) => counts.find((c) => c.channel === channel && c.status === status)?.n ?? 0;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
      {DELIVERY_CHANNELS.map((ch) => {
        const failed = n(ch.value, 'failed');
        return (
          <div key={ch.value} className={cn('card', failed > 0 && 'border-red-200')}>
            <p className="text-xs text-gray-500 mb-1">{ch.label} · last 7 days</p>
            <div className="flex items-baseline gap-4 text-sm">
              <span>
                <span className="text-lg font-semibold text-gray-900">{n(ch.value, 'sent')}</span> sent
              </span>
              <span className={failed > 0 ? 'text-red-700' : 'text-gray-500'}>
                <span className="text-lg font-semibold">{failed}</span> failed
              </span>
              <span className="text-gray-500">
                <span className="text-lg font-semibold">{n(ch.value, 'skipped')}</span> skipped
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
