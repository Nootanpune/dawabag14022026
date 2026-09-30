'use client';
import type { PartnerShipment } from '@/lib/partner/types';
import { formatDateTimeIST } from '@/lib/admin/format';
import { formatPrice } from '@/lib/utils';
import StatusBadge from '@/components/admin/StatusBadge';
import ShipmentLines from './ShipmentLines';
import InvoiceDownloadButton from '@/components/orders/InvoiceDownloadButton';

interface Props {
  shipment: PartnerShipment;
  onDispatch: (s: PartnerShipment) => void;
  onDelivered: (s: PartnerShipment) => void;
  busy?: boolean;
}

export default function ShipmentCard({ shipment: s, onDispatch, onDelivered, busy }: Props) {
  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div>
          <p className="font-semibold">
            {s.order_number}
            {s.invoice_number && <span className="text-xs text-gray-400 font-normal"> · Invoice {s.invoice_number}</span>}
          </p>
          <p className="text-xs text-gray-400">Received {formatDateTimeIST(s.created_at)}</p>
        </div>
        <div className="flex items-center gap-2">
            {s.cold_chain && <span className="badge-cold">Cold chain</span>}
            <StatusBadge status={s.status} />
        </div>
      </div>

      {s.status === 'pending' && (
        <div className="text-sm bg-gray-50 rounded-lg p-3 mb-3">
          <p className="text-xs font-semibold text-gray-500 mb-1">Ship to</p>
          <p className="font-medium">{s.ship_to_name}</p>
          <p className="text-gray-600">
            {s.address_line1}, {s.city}, {s.state} — {s.pincode}
          </p>
          <p className="text-gray-500">{s.ship_to_mobile}</p>
        </div>
      )}

      <ShipmentLines lines={s.lines} />

      <div className="flex flex-wrap items-center justify-between gap-2 mt-3 text-sm">
        <div className="text-xs text-gray-500">
          Subtotal {formatPrice(s.subtotal_paise)} · GST {formatPrice(s.gst_paise)} ·{' '}
          <span className="font-semibold text-gray-800">Total {formatPrice(s.total_paise)}</span>
          {s.awb_number && (
            <p className="mt-0.5">
              {s.courier_partner} · AWB {s.awb_number}
              {s.seal_number ? ` · Seal ${s.seal_number}` : ''} · dispatched {formatDateTimeIST(s.dispatched_at)}
            </p>
          )}
          {s.delivered_at && <p className="mt-0.5">Delivered {formatDateTimeIST(s.delivered_at)}</p>}
        </div>
        <div className="flex items-center gap-2">
          {s.invoice_number && <InvoiceDownloadButton shipmentId={s.id} invoiceNumber={s.invoice_number} />}
          {s.status === 'pending' && (
            <button onClick={() => onDispatch(s)} className="btn-primary text-xs py-1.5 px-3">
              Dispatch
            </button>
          )}
          {s.status === 'dispatched' && (
            <button onClick={() => onDelivered(s)} disabled={busy} className="btn-outline text-xs py-1.5 px-3 disabled:opacity-50">
              Mark delivered
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
