import type { ReactNode } from 'react';
import type { Einvoice } from '@/lib/einvoices/types';
import { DOC_TYPE_LABELS, shortIrn } from '@/lib/einvoices/api';
import { formatDateTimeIST } from '@/lib/admin/format';
import StatusBadge from '@/components/admin/StatusBadge';

interface Props {
  rows: Einvoice[];
  /** Retry button for failed / pending rows */
  actions?: (e: Einvoice) => ReactNode;
}

/** E-invoices with IRN, acknowledgement and the IRP's error for rows not yet registered (C-31). */
export default function EinvoiceTable({ rows, actions }: Props) {
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
            <th className="font-medium px-4 py-2.5">Document</th>
            <th className="font-medium px-4 py-2.5">Order / buyer GSTIN</th>
            <th className="font-medium px-4 py-2.5">Status</th>
            <th className="font-medium px-4 py-2.5">IRN / acknowledgement</th>
            <th className="font-medium px-4 py-2.5 text-right">Attempts</th>
            {actions && <th className="px-4 py-2.5" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} className="border-b border-gray-50 align-top">
              <td className="px-4 py-2.5">
                <p className="font-medium">{e.doc_number}</p>
                <p className="text-xs text-gray-400">
                  {DOC_TYPE_LABELS[e.doc_type] ?? e.doc_type} · {formatDateTimeIST(e.created_at)}
                </p>
              </td>
              <td className="px-4 py-2.5 text-xs">
                <p className="text-sm">{e.order_number}</p>
                <p className="font-mono text-gray-500">{e.buyer_gstin ?? '—'}</p>
              </td>
              <td className="px-4 py-2.5 text-xs">
                <StatusBadge status={e.status} />
                {(e.status === 'failed' || e.status === 'pending') && (e.error_code || e.error_message) && (
                  <p className="text-red-700 mt-1 max-w-xs">
                    {e.error_code && <span className="font-mono">{e.error_code}</span>}
                    {e.error_code && e.error_message && ' · '}
                    {e.error_message}
                  </p>
                )}
              </td>
              <td className="px-4 py-2.5 text-xs">
                <p className="font-mono" title={e.irn ?? undefined}>
                  {shortIrn(e.irn)}
                </p>
                {e.ack_no && (
                  <p className="text-gray-500">
                    Ack {e.ack_no} · {formatDateTimeIST(e.ack_date)}
                  </p>
                )}
              </td>
              <td className="px-4 py-2.5 text-right text-xs tabular-nums">
                <p>{e.attempts}</p>
                {e.last_attempt_at && <p className="text-gray-400">{formatDateTimeIST(e.last_attempt_at)}</p>}
              </td>
              {actions && <td className="px-4 py-2.5 text-right whitespace-nowrap">{actions(e)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
