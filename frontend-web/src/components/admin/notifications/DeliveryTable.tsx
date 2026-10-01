import type { NotificationDelivery } from '@/lib/notifications/types';
import { formatDateTimeIST } from '@/lib/admin/format';
import { cn } from '@/lib/utils';
import StatusBadge from '@/components/admin/StatusBadge';

/** Latest delivery attempts; failed rows are highlighted with the provider's reason. */
export default function DeliveryTable({ rows }: { rows: NotificationDelivery[] }) {
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
            <th className="font-medium px-4 py-2.5">When</th>
            <th className="font-medium px-4 py-2.5">Message</th>
            <th className="font-medium px-4 py-2.5">Channel</th>
            <th className="font-medium px-4 py-2.5">Recipient</th>
            <th className="font-medium px-4 py-2.5">Status</th>
            <th className="font-medium px-4 py-2.5">Reason / provider ref</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id} className={cn('border-b border-gray-50', d.status === 'failed' ? 'bg-red-50' : 'hover:bg-gray-50')}>
              <td className="px-4 py-2.5 text-xs whitespace-nowrap">{formatDateTimeIST(d.created_at)}</td>
              <td className="px-4 py-2.5">{d.type.replace(/_/g, ' ')}</td>
              <td className="px-4 py-2.5 uppercase text-xs">{d.channel}</td>
              <td className="px-4 py-2.5">{d.user_name ?? '—'}</td>
              <td className="px-4 py-2.5">
                <StatusBadge status={d.status} />
              </td>
              <td className={cn('px-4 py-2.5 text-xs', d.status === 'failed' ? 'text-red-700' : 'text-gray-500')}>
                {d.detail && <p>{d.detail}</p>}
                {d.provider_ref && <p className="font-mono text-gray-400">{d.provider_ref}</p>}
                {!d.detail && !d.provider_ref && '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
