import Link from 'next/link';
import { REFUND_METHOD_LABELS, type OrderDetail } from '@/lib/orders/api';
import { returnReasonLabel } from '@/lib/returns/api';
import { formatDateIST } from '@/lib/admin/format';
import { formatPrice } from '@/lib/utils';
import StatusBadge from '@/components/admin/StatusBadge';
import CreditNoteDownloadButton from './CreditNoteDownloadButton';

/** Returns, refunds and credit notes on this order (C-37). Renders nothing when there are none. */
export default function RefundsCard({ order }: { order: OrderDetail }) {
  const { returns = [], refunds = [], credit_notes: notes = [] } = order;
  if (!returns.length && !refunds.length && !notes.length) return null;
  return (
    <div className="card mb-4 space-y-4 text-sm">
      {returns.length > 0 && (
        <div>
          <h3 className="font-semibold mb-2">Returns</h3>
          <ul className="divide-y divide-gray-100">
            {returns.map((r) => (
              <li key={r.id} className="py-2 flex items-center justify-between gap-2">
                <Link href={`/account/returns/${r.id}`} className="text-brand-700 hover:underline">
                  {r.return_no} · {returnReasonLabel(r.reason)}
                </Link>
                <span className="flex items-center gap-2">
                  {r.refund_paise > 0 && formatPrice(r.refund_paise)}
                  <StatusBadge status={r.status} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {refunds.length > 0 && (
        <div>
          <h3 className="font-semibold mb-2">Refunds</h3>
          <ul className="divide-y divide-gray-100">
            {refunds.map((r) => (
              <li key={r.id} className="py-2 flex items-center justify-between gap-2">
                <span>
                  {REFUND_METHOD_LABELS[r.method] ?? r.method}
                  <span className="text-xs text-gray-400">
                    {' '}
                    · {r.source}
                    {r.processed_at ? ` · ${formatDateIST(r.processed_at)}` : ''}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {formatPrice(r.amount_paise)}
                  <StatusBadge status={r.status} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {notes.length > 0 && (
        <div>
          <h3 className="font-semibold mb-2">Credit notes</h3>
          <ul className="divide-y divide-gray-100">
            {notes.map((c) => (
              <li key={c.id} className="py-2 flex items-center justify-between gap-2">
                <span>
                  {c.credit_note_number} <span className="text-xs text-gray-400">· {c.reason.replace(/_/g, ' ')}</span>
                </span>
                <span className="flex items-center gap-2">
                  {formatPrice(c.total_paise)}
                  <CreditNoteDownloadButton id={c.id} number={c.credit_note_number} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
