'use client';
import { useState } from 'react';
import { FlaskConical, Loader2, XCircle } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import type { PaymentMethod } from '@/lib/payments/api';
import PaymentMethodTiles from './PaymentMethodTiles';

interface Props {
  amountPaise: number;
  methods: PaymentMethod[];
  busy: 'success' | 'failure' | null;
  onPay: (method: PaymentMethod, outcome: 'success' | 'failure') => void;
}

/** The trial server's payment (no Razorpay keys there): labelled demo, no money moves. */
export default function DemoPaymentPanel({ amountPaise, methods, busy, onPay }: Props) {
  const [method, setMethod] = useState<PaymentMethod>(methods[0] ?? 'upi');
  return (
    <div className="space-y-4" data-testid="demo-payment">
      <div className="p-3 rounded-lg border-2 border-dashed border-amber-400 bg-amber-50 text-sm text-amber-900 flex gap-2">
        <FlaskConical className="w-5 h-5 shrink-0" aria-hidden="true" />
        <p><strong>Demo payment — no money moves.</strong> This is the trial site, so real payment is switched off.
          Choose how you would pay, then press “Pay (demo)”. The order then goes ahead exactly as a paid order would.</p>
      </div>
      <PaymentMethodTiles methods={methods} value={method} onChange={setMethod} />
      <button type="button" onClick={() => onPay(method, 'success')} disabled={!!busy}
        className="btn-primary w-full py-3 flex items-center justify-center gap-2 text-base">
        {busy === 'success' && <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />}
        Pay {formatPrice(amountPaise)} (demo)
      </button>
      <button type="button" onClick={() => onPay(method, 'failure')} disabled={!!busy}
        className="btn-outline w-full py-2.5 flex items-center justify-center gap-2 text-sm">
        {busy === 'failure' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <XCircle className="w-4 h-4" aria-hidden="true" />}
        Simulate failure
      </button>
    </div>
  );
}
