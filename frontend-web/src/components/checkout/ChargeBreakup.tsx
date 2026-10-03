import type { CheckoutPreview } from '@/lib/checkout';
import { formatPrice } from '@/lib/utils';

function Row({ label, paise, minus }: { label: string; paise: number; minus?: boolean }) {
  return (
    <div className={`flex justify-between ${minus ? 'text-green-700' : 'text-gray-600'}`}>
      <span>{label}</span>
      <span>
        {minus ? '– ' : ''}
        {formatPrice(paise)}
      </span>
    </div>
  );
}

/** Full charge break-up before payment (C-35); every figure is the server's. */
export default function ChargeBreakup({ charges, paymentTerms }: { charges: CheckoutPreview['charges']; paymentTerms: string }) {
  return (
    <div className="text-sm space-y-1">
      <Row label="Items" paise={charges.items_paise} />
      <Row label="GST" paise={charges.gst_paise} />
      <Row label="Delivery" paise={charges.delivery_paise} />
      {charges.discount_paise > 0 && <Row label="Discount" paise={charges.discount_paise} minus />}
      {charges.wallet_paise > 0 && <Row label="Wallet" paise={charges.wallet_paise} minus />}
      <div className="flex justify-between font-semibold text-base border-t border-gray-100 pt-2 mt-1">
        <span>Total payable</span>
        <span className="text-brand-600">{formatPrice(charges.total_payable_paise)}</span>
      </div>
      {/* Sprint 43 (QA): "prepaid" said nothing to a shopper; credit terms are spelt out for trade buyers */}
      {paymentTerms !== 'prepaid' && <p className="text-xs text-gray-500">{termsWords(paymentTerms)}</p>}
    </div>
  );
}

/** Credit terms in words, e.g. net_30 → "Pay within 30 days (credit bill)". */
export function termsWords(t: string): string {
  const m = /^net_(\d+)$/.exec(t);
  if (m) return `Pay within ${m[1]} days (credit bill)`;
  if (t === 'cad') return 'Cash against delivery';
  if (t === 'postpaid') return 'Pay later (credit bill)';
  return t.replace(/_/g, ' ');
}
