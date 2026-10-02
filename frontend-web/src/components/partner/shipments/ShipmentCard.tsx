'use client';
import type { PartnerShipment } from '@/lib/partner/types';
import { formatPrice } from '@/lib/utils';
import StatusBadge from '@/components/admin/StatusBadge';
import ShipmentLines from './ShipmentLines';
import InvoiceDownloadButton from '@/components/orders/InvoiceDownloadButton';
import { formatDateTimeIST } from '@/lib/dates';

interface Props {
  shipment: PartnerShipment;
  onDispatch: (s: PartnerShipment) => void;
  onDelivered: (s: PartnerShipment) => void;
  /** Sprint 35: open the pharmacist check (release / hold / do not supply) */
  onCheck: (s: PartnerShipment) => void;
  busy?: boolean;
}

// Shipments from before Sprint 35 (not_recorded) and released ones can go; others wait (C-08)
const mayDispatch = (s: PartnerShipment) => !s.pharmacist_check || s.pharmacist_check === 'released' || s.pharmacist_check === 'not_recorded';

export default function ShipmentCard({ shipment: s, onDispatch, onDelivered, onCheck, busy }: Props) {
  const waiting = s.status === 'pending' && !mayDispatch(s);
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

      {/* Sprint 35: your registered pharmacist checks and releases every shipment first (C-08) */}
      {waiting && (
        <p id={`wait-${s.id}`} className="text-xs text-amber-900 bg-amber-50 rounded-lg p-2 mt-3" data-testid="partner-check-needed">
          {s.pharmacist_check === 'held'
            ? `On hold by your pharmacist: ${s.pharmacist_check_note ?? ''}`
            : 'Your registered pharmacist must check this shipment and release it before it is packed or dispatched.'}
        </p>
      )}
      {s.pharmacist_check === 'released' && s.pharmacist_name && (
        <p className="text-xs text-gray-700 mt-3">Checked by pharmacist {s.pharmacist_name}, Reg. no. {s.pharmacist_reg_no}</p>
      )}

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
          {waiting && (
            <button onClick={() => onCheck(s)} className="btn-outline text-xs py-1.5 px-3">Pharmacist check</button>
          )}
          {s.status === 'pending' && (
            <button onClick={() => onDispatch(s)} disabled={waiting} aria-describedby={waiting ? `wait-${s.id}` : undefined}
              className="btn-primary text-xs py-1.5 px-3">
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
