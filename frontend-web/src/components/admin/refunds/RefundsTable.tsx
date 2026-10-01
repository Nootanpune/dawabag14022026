'use client';
import Link from 'next/link';
import { canRetryGatewayRefund, type Refund } from '@/lib/returns/api';
import { REFUND_METHOD_LABELS } from '@/lib/orders/api';
import { formatDateTimeIST } from '@/lib/admin/format';
import { formatPrice } from '@/lib/utils';
import StatusBadge from '@/components/admin/StatusBadge';
import RetryRefundButton from './RetryRefundButton';

interface Props {
  rows: Refund[];
  onMarkProcessed: (r: Refund) => void;
}

/** Refund ledger for accounts (C-37). Failed gateway refunds show the server's reason. */
export default function RefundsTable({ rows, onMarkProcessed }: Props) {
  return (
    <div className="card p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500">
          <tr className="text-left">
            <th className="font-medium px-4 py-2.5">Order</th>
            <th className="font-medium px-4 py-2.5">Source / method</th>
            <th className="font-medium px-4 py-2.5 text-right">Amount</th>
            <th className="font-medium px-4 py-2.5">Status</th>
            <th className="font-medium px-4 py-2.5">Reference</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.id} className="align-top">
              <td className="px-4 py-2.5">
                <p className="font-medium">{r.order_number}</p>
                <p className="text-xs text-gray-400">{formatDateTimeIST(r.created_at)}</p>
                {r.return_id && (
                  <Link href={`/admin/returns/${r.return_id}`} className="text-xs text-brand-600 hover:underline">
                    View return
                  </Link>
                )}
              </td>
              <td className="px-4 py-2.5 text-xs">
                {r.source} · {REFUND_METHOD_LABELS[r.method] ?? r.method}
              </td>
              <td className="px-4 py-2.5 text-right">{formatPrice(r.amount_paise)}</td>
              <td className="px-4 py-2.5">
                <StatusBadge status={r.status} />
                {r.failure_reason && <p className="text-xs text-red-600 mt-1 max-w-xs">{r.failure_reason}</p>}
                {r.method === 'gateway' && !!r.gateway_attempts && (
                  <p className="text-xs text-gray-400 mt-1">
                    Sent to Razorpay {r.gateway_attempts} time{r.gateway_attempts === 1 ? '' : 's'}
                  </p>
                )}
              </td>
              <td className="px-4 py-2.5 text-xs font-mono">
                {r.reference ?? r.gateway_refund_id ?? '—'}
                {r.processed_at && <p className="font-sans text-gray-400">{formatDateTimeIST(r.processed_at)}</p>}
              </td>
              <td className="px-4 py-2.5 text-right space-y-1.5">
                {canRetryGatewayRefund(r) && (
                  <div>
                    <RetryRefundButton refund={r} />
                  </div>
                )}
                {r.status !== 'processed' && (
                  <button onClick={() => onMarkProcessed(r)} className="btn-outline text-xs py-1.5 px-3 whitespace-nowrap">
                    Mark paid
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
