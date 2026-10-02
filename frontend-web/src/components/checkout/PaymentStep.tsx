'use client';
import { useState } from 'react';
import { Loader2, CreditCard, Lock } from 'lucide-react';
import api from '@/lib/api';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { formatPrice } from '@/lib/utils';
import { payOrderDemo, type DemoChoice } from '@/lib/payments/api';
import { paidByLabel, type DemoOutcome } from '@/lib/payments/demoCheckout';
import { openCheckout, PaymentWindowError } from '@/lib/payments/razorpayCheckout';
import { usePaymentOptions } from '@/hooks/usePaymentOptions';
import DemoPaymentPanel from '@/components/payments/DemoPaymentPanel';
import PaymentUnavailable from '@/components/payments/PaymentUnavailable';
import RxAttachedLine, { type ChosenRx } from './rx/RxAttachedLine';
import RxPolicyNote from './rx/RxPolicyNote';
import type { PlacedOrder } from './types';

interface Props {
  order: PlacedOrder;
  /** the prescription sent with this order, if it needs one (C-08) */
  rx: ChosenRx | null;
  /** paidBy: how the demo payment was made, e.g. "HDFC netbanking (demo)" */
  onPaid: (o: { demo: boolean; paidBy?: string }) => void;
}

type Notice = { tone: 'error' | 'info'; text: string } | null;

/**
 * Pay for a placed order. With Razorpay keys, "Pay securely" opens Razorpay's window
 * (UPI, cards, netbanking, wallets). On the owner's trial without keys, a labelled demo
 * payment (no money moves). Otherwise a plain "not available" note — never a raw error.
 */
export default function PaymentStep({ order, rx, onPaid }: Props) {
  const { data: options, isLoading } = usePaymentOptions();
  const [busy, setBusy] = useState<'razorpay' | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const payWithRazorpay = async () => {
    setBusy('razorpay');
    setNotice(null);
    try {
      const { data } = await api.post('/payments/create-order', { order_id: order.id });
      const r = data.data;
      const outcome = await openCheckout({ key: r.razorpay_key_id, amount: r.amount, orderId: r.razorpay_order_id, description: `Order ${order.order_number}` });
      if (outcome.kind === 'dismissed') {
        setNotice({ tone: 'info', text: 'Payment window closed. Nothing was charged. Press “Pay securely” when you are ready.' });
      } else if (outcome.kind === 'failed') {
        setNotice({ tone: 'error', text: `Your payment did not go through (${outcome.reason}). No money was taken. Please try again or choose another way to pay.` });
      } else {
        try {
          await api.post('/payments/verify', { ...outcome.response, order_id: order.id });
          onPaid({ demo: false });
        } catch {
          setNotice({ tone: 'error', text: 'We received your payment but could not confirm it yet. Please do not pay again — check My orders in a few minutes, or contact us.' });
        }
      }
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof PaymentWindowError ? err.message
        : getApiErrorMessage(err, 'We could not start the payment. Please try again in a minute.') });
    } finally {
      setBusy(null);
    }
  };

  // Called only from the demo checkout's last screen (Approve / Decline …); its own
  // screens say when a payment did not go through, so only request errors are noted here.
  const payDemo = async (choice: DemoChoice, outcome: 'success' | 'failure'): Promise<DemoOutcome> => {
    setNotice(null);
    try {
      const r = await payOrderDemo(order.id, choice, outcome);
      if (r.paid) { onPaid({ demo: true, paidBy: paidByLabel(choice) }); return 'paid'; }
      return 'not_paid';
    } catch (err) {
      setNotice({ tone: 'error', text: getApiErrorMessage(err, 'We could not record the demo payment. Please try again.') });
      return 'error';
    }
  };

  return (
    <div className="card space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <CreditCard className="w-5 h-5 text-brand-600" aria-hidden="true" /> Payment
      </h2>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between text-gray-600"><span>Order</span><span>{order.order_number}</span></div>
        <div className="border-t border-gray-100 pt-2 flex justify-between font-semibold text-base">
          <span>Total payable</span><span className="text-brand-700">{formatPrice(order.total_paise)}</span>
        </div>
        <p className="text-xs text-gray-500">Includes delivery and all taxes (GST). No cash on delivery.</p>
      </div>

      {rx && (<><RxAttachedLine rx={rx} /><RxPolicyNote /></>)}

      {notice && (
        <p role={notice.tone === 'error' ? 'alert' : 'status'}
          className={notice.tone === 'error' ? 'text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg p-3' : 'text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-lg p-3'}>
          {notice.text}
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Getting payment options…</p>
      ) : options?.mode === 'demo' ? (
        <DemoPaymentPanel amountPaise={order.total_paise} methods={options.methods} providers={options.providers} onPay={payDemo} />
      ) : options?.mode === 'razorpay' ? (
        <>
          <p className="text-sm text-gray-700">You can pay by UPI, debit or credit card, netbanking or a wallet in Razorpay’s secure window.</p>
          <button type="button" onClick={payWithRazorpay} disabled={!!busy}
            className="btn-primary w-full py-3 flex items-center justify-center gap-2 text-base">
            {busy ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> : <Lock className="w-5 h-5" aria-hidden="true" />}
            Pay {formatPrice(order.total_paise)} securely
          </button>
        </>
      ) : (
        <PaymentUnavailable what={`Your order ${order.order_number} is saved.`} />
      )}
    </div>
  );
}
