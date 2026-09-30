import type { ReactNode } from 'react';
import { DISPOSITIONS, returnReasonLabel, type ReturnDetail } from '@/lib/returns/api';
import { REFUND_METHOD_LABELS } from '@/lib/orders/api';
import { formatDateIST, formatDateTimeIST } from '@/lib/admin/format';
import { formatPrice } from '@/lib/utils';
import StatusBadge from '@/components/admin/StatusBadge';

/** A return with its items (batch / expiry), decision, credit notes and refunds (C-37). Shared by buyer, staff and partner views. */
export default function ReturnDetailView({ r, actions }: { r: ReturnDetail; actions?: ReactNode }) {
  const disposition = DISPOSITIONS.find((d) => d.value === r.disposition)?.label;
  return (
    <div className="space-y-4 text-sm">
      <div className="card">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <h1 className="text-lg font-semibold font-mono">{r.return_no}</h1>
          <StatusBadge status={r.status} />
        </div>
        <p className="text-xs text-gray-500">
          Order {r.order_number} · {returnReasonLabel(r.reason)} · raised {formatDateTimeIST(r.created_at)}
          {r.buyer_name ? ` · ${r.buyer_name}` : ''}
          {' · '}
          {r.seller_type === 'dawabag' ? 'Sold by Dawabag' : `Sold by ${r.partner_name ?? 'partner'}`}
        </p>
        <p className="mt-3 whitespace-pre-wrap">{r.description}</p>
        {r.decision_notes && (
          <div className="mt-3 rounded-lg bg-gray-50 p-3">
            <p className="text-xs font-semibold text-gray-600 mb-1">Decision {r.decided_at ? `· ${formatDateTimeIST(r.decided_at)}` : ''}</p>
            <p className="whitespace-pre-wrap">{r.decision_notes}</p>
          </div>
        )}
        {r.refund_paise > 0 && <p className="mt-2 font-medium">Refund: {formatPrice(r.refund_paise)}</p>}
        {disposition && <p className="text-xs text-gray-500 mt-1">Goods: {disposition} (never restocked)</p>}
        {actions}
      </div>

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-500">
            <tr className="text-left">
              <th className="font-medium px-3 py-2">Item</th>
              <th className="font-medium px-3 py-2 text-right">Returned</th>
              <th className="font-medium px-3 py-2">Batch</th>
              <th className="font-medium px-3 py-2">Expiry</th>
              <th className="font-medium px-3 py-2 text-right">Line value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {r.items.map((i) => (
              <tr key={i.order_item_id}>
                <td className="px-3 py-2">{i.product_name}</td>
                <td className="px-3 py-2 text-right">
                  {i.quantity} of {i.delivered_qty}
                </td>
                <td className="px-3 py-2 font-mono">{i.batch_number ?? '—'}</td>
                <td className="px-3 py-2">{formatDateIST(i.expiry_date)}</td>
                <td className="px-3 py-2 text-right">{formatPrice(i.line_total_paise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(r.credit_notes.length > 0 || r.refunds.length > 0) && (
        <div className="card space-y-2">
          {r.credit_notes.map((c) => (
            <p key={c.credit_note_number} className="flex justify-between">
              <span>Credit note {c.credit_note_number}</span> <span>{formatPrice(c.total_paise)}</span>
            </p>
          ))}
          {r.refunds.map((f, idx) => (
            <p key={idx} className="flex justify-between items-center">
              <span>
                Refund · {REFUND_METHOD_LABELS[f.method] ?? f.method}
                {f.processed_at ? ` · ${formatDateIST(f.processed_at)}` : ''}
              </span>
              <span className="flex items-center gap-2">
                {formatPrice(f.amount_paise)} <StatusBadge status={f.status} />
              </span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
