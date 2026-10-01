import type { PurchaseReturn } from '@/lib/purchaseReturns/types';
import { RETURN_REASON_LABELS } from '@/lib/purchaseReturns/labels';
import { formatPaise } from '@/lib/admin/format';
import StatusBadge from '@/components/admin/StatusBadge';
import { formatDateIST, formatDateTimeIST } from '@/lib/dates';

/** Header card: supplier, money, and the trail requested → decided → dispatched → settled (C-28, C-46). */
export default function ReturnSummary({ r }: { r: PurchaseReturn }) {
  const tax = [
    ['CGST', r.cgst_paise],
    ['SGST', r.sgst_paise],
    ['IGST', r.igst_paise],
  ].filter(([, v]) => Number(v) > 0);
  return (
    <div className="card grid sm:grid-cols-4 gap-3 text-sm mb-4">
      <div>
        <p className="text-xs text-gray-400">Supplier</p>
        <p>{r.supplier_name}</p>
        <p className="font-mono text-xs text-gray-500">{r.supplier_gstin ?? '—'}</p>
      </div>
      <div>
        <p className="text-xs text-gray-400">Reason</p>
        <p>{RETURN_REASON_LABELS[r.reason] ?? r.reason}</p>
        <StatusBadge status={r.status} />
      </div>
      <div>
        <p className="text-xs text-gray-400">Taxable</p>
        <p>{formatPaise(r.taxable_paise)}</p>
        {tax.map(([k, v]) => (
          <p key={String(k)} className="text-xs text-gray-400">
            {k} {formatPaise(v)}
          </p>
        ))}
      </div>
      <div>
        <p className="text-xs text-gray-400">Total</p>
        <p className="font-semibold">{formatPaise(r.total_paise)}</p>
      </div>
      <p className="sm:col-span-4 text-gray-600">Notes: {r.notes}</p>
      <div className="sm:col-span-4 grid sm:grid-cols-2 gap-2 text-xs text-gray-600 border-t border-gray-100 pt-3">
        <p>
          Requested by {r.requested_by_name} · {formatDateTimeIST(r.created_at)}
        </p>
        {r.decided_at && (
          <p>
            {r.status === 'rejected' ? 'Rejected' : 'Approved'} by {r.approved_by_name ?? '—'} · {formatDateTimeIST(r.decided_at)}
            {r.decision_notes && ` — ${r.decision_notes}`}
          </p>
        )}
        {r.dispatched_at && (
          <p>
            Dispatched {formatDateTimeIST(r.dispatched_at)} · ref {r.dispatch_reference}
          </p>
        )}
        {r.settled_at && (
          <p>
            Supplier credit note {r.supplier_credit_note_no} dated {formatDateIST(r.supplier_credit_note_date)} ·{' '}
            {formatPaise(r.supplier_credit_paise)}
          </p>
        )}
      </div>
    </div>
  );
}
