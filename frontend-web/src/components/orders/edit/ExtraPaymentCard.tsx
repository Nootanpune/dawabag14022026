'use client';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Lock } from 'lucide-react';
import api from '@/lib/api';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { orderKeys, type OrderDetail } from '@/lib/orders/api';
import { createEditPayment, payEditDemo, type DemoChoice } from '@/lib/payments/api';
import type { DemoOutcome } from '@/lib/payments/demoCheckout';
import { openCheckout, PaymentWindowError } from '@/lib/payments/razorpayCheckout';
import { usePaymentOptions } from '@/hooks/usePaymentOptions';
import { formatPrice } from '@/lib/utils';
import DemoPaymentPanel from '@/components/payments/DemoPaymentPanel';
import PaymentUnavailable from '@/components/payments/PaymentUnavailable';

/**
 * The difference to pay after a change raised the order's value (Sprint 44): a second payment,
 * held until the pharmacist's check when the order holds prescription medicines. Our pharmacist
 * approves the order only once it is paid.
 */
export default function ExtraPaymentCard({ order }: { order: OrderDetail }) {
  const queryClient = useQueryClient();
  const { data: options, isLoading } = usePaymentOptions();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const due = order.extra_payment;
  if (!due || due.status !== 'awaiting_payment') return null;
  const held = order.requires_prescription;
  const refresh = () => queryClient.invalidateQueries({ queryKey: orderKeys.one(order.id) });

  const payWithRazorpay = async () => {
    setBusy(true); setNotice('');
    try {
      const r = await createEditPayment(order.id, due.order_edit_id);
      const outcome = await openCheckout({ key: r.razorpay_key_id, amount: r.amount, orderId: r.razorpay_order_id, description: `Change to order ${order.order_number}` });
      if (outcome.kind === 'paid') { await api.post('/payments/verify', outcome.response); refresh(); }
      else if (outcome.kind === 'failed') setNotice(`Your payment did not go through (${outcome.reason}). No money was taken.`);
    } catch (err) {
      setNotice(err instanceof PaymentWindowError ? err.message : getApiErrorMessage(err, 'We could not take the payment. Please try again.'));
    } finally { setBusy(false); }
  };
  const payDemo = async (choice: DemoChoice, outcome: 'success' | 'failure'): Promise<DemoOutcome> => {
    try {
      const r = await payEditDemo(order.id, due.order_edit_id, choice, outcome);
      refresh();
      return r.paid ? 'paid' : 'not_paid';
    } catch (err) { setNotice(getApiErrorMessage(err, 'We could not record the demo payment.')); return 'error'; }
  };

  return (
    <div className="card mb-4 space-y-3 border-amber-300" data-testid="extra-payment">
      <div>
        <h3 className="font-semibold text-sm">Pay the difference for your change</h3>
        <p className="text-sm text-gray-700">
          {formatPrice(due.amount_paise)} is due. Our pharmacist approves the order once it is paid.
          {held ? ' The amount is held now and taken only after the pharmacist’s check.' : ''}
        </p>
      </div>
      {notice && <p role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg p-2">{notice}</p>}
      {isLoading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        : options?.mode === 'demo' ? <DemoPaymentPanel amountPaise={due.amount_paise} methods={options.methods} providers={options.providers} onPay={payDemo} />
        : options?.mode === 'razorpay' ? (
          <button type="button" onClick={payWithRazorpay} disabled={busy} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
            {busy ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> : <Lock className="w-5 h-5" aria-hidden="true" />}
            {held ? `Authorise ${formatPrice(due.amount_paise)} securely` : `Pay ${formatPrice(due.amount_paise)} securely`}
          </button>
        ) : <PaymentUnavailable what="Your change is saved." />}
    </div>
  );
}
