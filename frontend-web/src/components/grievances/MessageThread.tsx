import type { GrievanceDetail } from '@/lib/grievances/api';
import { formatDateTimeIST } from '@/lib/admin/format';
import { cn } from '@/lib/utils';

/** The complaint text followed by every buyer / staff message, oldest first. */
export default function MessageThread({ g, viewer }: { g: GrievanceDetail; viewer: 'buyer' | 'staff' }) {
  const mine = (fromStaff: boolean) => (viewer === 'staff' ? fromStaff : !fromStaff);
  return (
    <ol className="space-y-3">
      <li className="rounded-lg bg-gray-50 border border-gray-100 p-3">
        <p className="text-xs text-gray-500 mb-1">
          {viewer === 'staff' ? g.buyer_name ?? 'Buyer' : 'You'} · {formatDateTimeIST(g.created_at)}
        </p>
        <p className="text-sm whitespace-pre-wrap">{g.description}</p>
      </li>
      {g.messages.map((m) => (
        <li
          key={m.id}
          className={cn(
            'rounded-lg p-3 max-w-[90%]',
            mine(m.from_staff) ? 'ml-auto bg-brand-50 border border-brand-100' : 'bg-white border border-gray-200'
          )}
        >
          <p className="text-xs text-gray-500 mb-1">
            {m.from_staff ? m.author ?? 'Dawabag support' : viewer === 'buyer' ? 'You' : m.author ?? 'Buyer'} ·{' '}
            {formatDateTimeIST(m.created_at)}
          </p>
          <p className="text-sm whitespace-pre-wrap">{m.body}</p>
        </li>
      ))}
    </ol>
  );
}
