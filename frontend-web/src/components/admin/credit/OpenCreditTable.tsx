'use client';
import { cn, formatPrice } from '@/lib/utils';
import type { OpenCreditOrder } from '@/lib/admin/credit';
import { formatDateIST } from '@/lib/admin/format';

function dueLabel(days: number | null): string {
  if (days == null) return '—';
  if (days < 0) return `${Math.abs(days)} day${days === -1 ? '' : 's'} overdue`;
  if (days === 0) return 'Due today';
  return `in ${days} day${days === 1 ? '' : 's'}`;
}

export default function OpenCreditTable({
  orders,
  onRecordPayment,
}: {
  orders: OpenCreditOrder[];
  onRecordPayment: (order: OpenCreditOrder) => void;
}) {
  // Display order only: due soonest (most overdue) first.
  const sorted = [...orders].sort((a, b) => (a.days_to_due ?? Infinity) - (b.days_to_due ?? Infinity));

  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
            <th className="font-medium px-4 py-2.5">Order</th>
            <th className="font-medium px-4 py-2.5">Buyer</th>
            <th className="font-medium px-4 py-2.5">Terms</th>
            <th className="font-medium px-4 py-2.5 text-right">Amount</th>
            <th className="font-medium px-4 py-2.5">Due</th>
            <th className="font-medium px-4 py-2.5">Credit used / limit</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((o) => {
            const overdue = (o.days_to_due ?? 0) < 0;
            return (
              <tr key={o.id} className={cn('border-b border-gray-50', overdue && 'bg-red-50')}>
                <td className="px-4 py-2.5 font-medium text-brand-700">{o.order_number}</td>
                <td className="px-4 py-2.5">
                  <p className="font-medium">{o.business_name || '—'}</p>
                  <p className="text-xs text-gray-400">{o.mobile}</p>
                </td>
                <td className="px-4 py-2.5 text-xs">{o.payment_terms.replace(/_/g, ' ')}</td>
                <td className="px-4 py-2.5 text-right">{formatPrice(o.total_paise)}</td>
                <td className="px-4 py-2.5">
                  <p className="text-xs">{formatDateIST(o.credit_due_date)}</p>
                  <p className={cn('text-xs', overdue ? 'text-red-600 font-medium' : 'text-gray-400')}>
                    {dueLabel(o.days_to_due)}
                  </p>
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-600">
                  {formatPrice(o.credit_used_paise)} / {formatPrice(o.credit_limit_paise)}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => onRecordPayment(o)} className="btn-outline text-xs py-1.5 px-3 whitespace-nowrap">
                    Record payment
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
