import { formatPrice } from '@/lib/utils';
import InvoiceDownloadButton from './InvoiceDownloadButton';

/** One seller-of-record shipment as returned by the order API (no partner name unless the server sends one). */
export interface OrderShipment {
  id: string;
  seller_type: 'dawabag' | 'partner' | string;
  invoice_number: string | null;
  total_paise?: number;
  partner_name?: string | null;
}

export function sellerLabel(s: OrderShipment): string {
  if (s.seller_type === 'dawabag') return 'Sold by Dawabag';
  return s.partner_name ? `Sold by ${s.partner_name}` : 'Sold by a Dawabag marketplace partner';
}

/** "Sold by …" + invoice download per shipment (each seller invoices its own lines, C-13). Renders nothing if the API sent no shipments. */
export default function SoldBySection({ shipments, className }: { shipments?: OrderShipment[] | null; className?: string }) {
  if (!shipments?.length) return null;
  return (
    <div className={className ?? 'card mb-4'}>
      <h3 className="font-semibold text-sm mb-2">{shipments.length > 1 ? 'Shipments' : 'Seller'}</h3>
      <ul className="divide-y divide-gray-100 text-sm">
        {shipments.map((s) => (
          <li key={s.id} className="py-2 flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">{sellerLabel(s)}</p>
              {s.invoice_number && <p className="text-xs text-gray-400">Invoice {s.invoice_number}</p>}
            </div>
            <div className="flex items-center gap-2">
              {s.total_paise != null && <span className="text-gray-700">{formatPrice(s.total_paise)}</span>}
              {s.invoice_number && <InvoiceDownloadButton shipmentId={s.id} invoiceNumber={s.invoice_number} />}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
