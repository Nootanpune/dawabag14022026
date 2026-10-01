'use client';
import { useState } from 'react';
import type { OrderDetail, OrderShipmentDetail } from '@/lib/orders/api';
import { RECEIVER_RELATIONS } from '@/lib/fulfilment/handover';
import { formatDateTimeIST } from '@/lib/admin/format';
import { formatPrice } from '@/lib/utils';
import StatusBadge from '@/components/admin/StatusBadge';
import InvoiceDownloadButton from './InvoiceDownloadButton';
import DeliveryCodeBanner from './DeliveryCodeBanner';
import ReturnRequestDialog from './ReturnRequestDialog';
import ShipmentTrackingTimeline from './ShipmentTrackingTimeline';

function relationLabel(r: string | null) {
  return RECEIVER_RELATIONS.find((x) => x.value === r)?.label ?? r ?? '';
}

/** One block per seller of record (C-05, C-13) with seal, delivery code and handover (C-26), courier tracking and returns (C-37). */
export default function OrderShipmentsCard({ order }: { order: OrderDetail }) {
  const [returning, setReturning] = useState<OrderShipmentDetail | null>(null);
  if (!order.shipments?.length) return null;

  return (
    <div className="card mb-4">
      <h3 className="font-semibold text-sm mb-2">{order.shipments.length > 1 ? 'Shipments' : 'Shipment'}</h3>
      <ul className="divide-y divide-gray-100 text-sm">
        {order.shipments.map((s) => (
          <li key={s.id} className="py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">Sold by {s.seller_name ?? (s.seller_type === 'dawabag' ? 'Dawabag' : 'a marketplace partner')}</p>
                {s.invoice_number && <p className="text-xs text-gray-400">Invoice {s.invoice_number}</p>}
                {s.awb_number && (
                  <p className="text-xs text-gray-500">
                    {s.courier_partner} · AWB {s.awb_number}
                    {s.seal_number ? ` · Seal no. ${s.seal_number}` : ''}
                  </p>
                )}
                {s.delivered_at && (
                  <p className="text-xs text-gray-500">
                    Delivered {formatDateTimeIST(s.delivered_at)}
                    {s.received_by_name ? ` · received by ${s.received_by_name} (${relationLabel(s.received_by_relation)})` : ''}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={s.status} />
                <span className="text-gray-700">{formatPrice(s.total_paise)}</span>
              </div>
            </div>
            {s.handover_code && <DeliveryCodeBanner code={s.handover_code} />}
            <ShipmentTrackingTimeline shipment={s} />
            {s.status === 'dispatched' && s.seal_number && (
              <p className="text-xs text-gray-500 mt-1">Check the seal number on the pack matches before accepting it.</p>
            )}
            <div className="flex flex-wrap gap-2 mt-2">
              {s.invoice_number && <InvoiceDownloadButton shipmentId={s.id} invoiceNumber={s.invoice_number} />}
              {s.status === 'delivered' && (
                <button onClick={() => setReturning(s)} className="btn-outline text-xs py-1.5 px-3">
                  Report a problem / return
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {returning && <ReturnRequestDialog order={order} shipment={returning} onClose={() => setReturning(null)} />}
    </div>
  );
}
