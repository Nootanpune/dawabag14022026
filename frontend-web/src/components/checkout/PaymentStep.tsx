'use client';
import { useState } from 'react';
import { Loader2, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { formatPrice } from '@/lib/utils';
import type { PlacedOrder } from './types';

declare global {
  interface Window {
    Razorpay: any;
  }
}

interface Props {
  order: PlacedOrder;
  onPaid: () => void;
}

export default function PaymentStep({ order, onPaid }: Props) {
  const [loading, setLoading] = useState(false);

  const handlePayment = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/payments/create-order', { order_id: order.id });
      const rzpData = data.data;

      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      document.body.appendChild(script);
      script.onload = () => {
        const rzp = new window.Razorpay({
          key: rzpData.razorpay_key_id,
          amount: rzpData.amount,
          currency: 'INR',
          name: 'Dawabag',
          description: `Order ${order.order_number}`,
          order_id: rzpData.razorpay_order_id,
          handler: async (response: any) => {
            try {
              await api.post('/payments/verify', {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                order_id: order.id,
              });
              onPaid();
            } catch {
              toast.error('Payment verification failed. Contact support.');
            }
          },
          prefill: {},
          theme: { color: '#1A8856' },
        });
        rzp.open();
        setLoading(false);
      };
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Payment initialization failed'));
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <CreditCard className="w-5 h-5 text-brand-600" /> Payment
      </h2>
      <div className="space-y-2 text-sm mb-6">
        <div className="flex justify-between text-gray-600">
          <span>Order</span>
          <span>{order.order_number}</span>
        </div>
        <div className="border-t border-gray-100 pt-2 flex justify-between font-semibold text-base">
          <span>Total payable</span>
          <span className="text-brand-600">{formatPrice(order.total_paise)}</span>
        </div>
        <p className="text-xs text-gray-400">Incl. shipping and all taxes (GST)</p>
      </div>
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 mb-5">
        No cash on delivery. Secure payment via Razorpay — UPI, cards, net banking, wallets.
      </div>
      <button
        onClick={handlePayment}
        disabled={loading}
        className="btn-primary w-full py-3 flex items-center justify-center gap-2 text-base"
      >
        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
        Pay {formatPrice(order.total_paise)} securely
      </button>
    </div>
  );
}
