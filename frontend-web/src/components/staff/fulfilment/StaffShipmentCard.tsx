import { AlertTriangle } from 'lucide-react';
import type { QueueShipment } from '@/lib/fulfilment/types';
import { formatDateIST, formatDateTimeIST } from '@/lib/admin/format';
import { formatPrice } from '@/lib/utils';
import StatusBadge from '@/components/admin/StatusBadge';
import InvoiceDownloadButton from '@/components/orders/InvoiceDownloadButton';

interface Props {
  shipment: QueueShipment;
  actionLabel: string;
  onAction: () => void;
  busy?: boolean;
}

/** One Dawabag-own shipment in the pack / dispatch / deliver queue. */
export default function StaffShipmentCard({ shipment: s, actionLabel, onAction, busy }: Props) {
  const rxPending = s.lines.some((l) => !l.rx_cleared);
  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
        <div>
          <p className="font-semibold">
            {s.order_number}
            {s.invoice_number && <span className="text-xs text-gray-400 font-normal"> · Invoice {s.invoice_number}</span>}
          </p>
          <p className="text-xs text-gray-500">
            {s.ship_to_name ?? '—'} · {s.city ?? ''} {s.pincode ?? ''} · {formatDateTimeIST(s.created_at)}
          </p>
          {s.awb_number && (
            <p className="text-xs text-gray-500">
              {s.courier_partner} · AWB {s.awb_number}
              {s.seal_number ? ` · Seal ${s.seal_number}` : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {s.cold_chain && <span className="badge-cold">Cold chain</span>}
          <StatusBadge status={s.order_status} />
        </div>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-gray-500 border-b border-gray-100">
            <th className="font-medium py-1">Product</th>
            <th className="font-medium py-1 text-right">Qty</th>
            <th className="font-medium py-1">Batch</th>
            <th className="font-medium py-1">Expiry</th>
          </tr>
        </thead>
        <tbody>
          {s.lines.map((l, i) => (
            <tr key={i} className="border-b border-gray-50">
              <td className="py-1 pr-2">{l.product_name}</td>
              <td className="py-1 text-right">{l.quantity}</td>
              <td className="py-1 px-2 font-mono">{l.batch_number ?? '—'}</td>
              <td className="py-1">{formatDateIST(l.expiry_date)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Server blocks pack/dispatch until Rx is verified (C-08); warn up front */}
      {rxPending && (
        <p className="text-xs text-amber-800 bg-amber-50 rounded-lg p-2 mt-2 flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5" /> Some lines are prescription-only and not yet verified — shown as-is from the queue.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
        <span className="text-sm font-semibold">{formatPrice(s.total_paise)}</span>
        <div className="flex items-center gap-2">
          {s.invoice_number && <InvoiceDownloadButton shipmentId={s.shipment_id} invoiceNumber={s.invoice_number} />}
          <button onClick={onAction} disabled={busy} className="btn-primary text-xs py-1.5 px-3">
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
