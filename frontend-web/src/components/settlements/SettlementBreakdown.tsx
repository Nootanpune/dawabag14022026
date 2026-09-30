import type { Settlement } from '@/lib/marketplace/settlement';
import { formatDateIST } from '@/lib/admin/format';
import { formatPrice } from '@/lib/utils';
import StatusBadge from '@/components/admin/StatusBadge';

function Line({ label, paise, minus, strong }: { label: string; paise: number; minus?: boolean; strong?: boolean }) {
  return (
    <div className={`flex justify-between py-1.5 ${strong ? 'font-semibold border-t border-gray-200 mt-1 pt-2' : ''}`}>
      <span className={strong ? '' : 'text-gray-600'}>{label}</span>
      <span className={minus ? 'text-red-600' : ''}>
        {minus ? '– ' : ''}
        {formatPrice(paise)}
      </span>
    </div>
  );
}

/** Deductions from gross to net — every figure is the server's (settlement.service). */
export default function SettlementBreakdown({ s }: { s: Settlement }) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="card text-sm">
        <h3 className="font-semibold mb-2">Payout</h3>
        <Line label="Gross sale value" paise={s.gross_sale_value_paise} />
        <Line label="Commission" paise={s.commission_paise} minus />
        <Line label="Finding fee" paise={s.finding_fee_paise} minus />
        <Line label="GST on fees" paise={s.fee_gst_paise} minus />
        <Line label="TCS" paise={s.tcs_paise} minus />
        <Line label="TDS" paise={s.tds_paise} minus />
        <Line label="Net payable" paise={s.net_payable_paise} strong />
      </div>
      <div className="card text-sm space-y-1.5">
        <h3 className="font-semibold mb-2">Details</h3>
        <p className="flex justify-between">
          <span className="text-gray-600">Status</span> <StatusBadge status={s.payment_status} />
        </p>
        <p className="flex justify-between">
          <span className="text-gray-600">Period</span>
          <span>
            {formatDateIST(s.period_from)} – {formatDateIST(s.period_to)}
          </span>
        </p>
        <p className="flex justify-between">
          <span className="text-gray-600">Orders</span> <span>{s.total_orders}</span>
        </p>
        <p className="flex justify-between">
          <span className="text-gray-600">Taxable value</span> <span>{formatPrice(s.taxable_value_paise)}</span>
        </p>
        <p className="flex justify-between">
          <span className="text-gray-600">GST collected</span> <span>{formatPrice(s.gst_collected_paise)}</span>
        </p>
        <p className="flex justify-between">
          <span className="text-gray-600">Commission invoice</span> <span>{s.commission_invoice_no ?? '—'}</span>
        </p>
        {s.payment_status === 'paid' && (
          <p className="flex justify-between">
            <span className="text-gray-600">Paid</span>
            <span>
              {s.payment_mode} · {s.utr_reference} · {formatDateIST(s.paid_at)}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
