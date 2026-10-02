'use client';
import { useState, type KeyboardEvent } from 'react';
import { XCircle } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import type { DemoChoice, PaymentMethod, PaymentOptions } from '@/lib/payments/api';
import { METHOD_STEP_TITLES, type DemoPay } from '@/lib/payments/demoCheckout';
import PaymentMethodTiles from './PaymentMethodTiles';
import DemoBanner from './demo/DemoBanner';
import StepHeading from './demo/StepHeading';
import BackLink from './demo/BackLink';
import UpiStep from './demo/UpiStep';
import CardStep from './demo/CardStep';
import ProviderStep from './demo/ProviderStep';
import ConfirmStep from './demo/ConfirmStep';

interface Props {
  amountPaise: number;
  methods: PaymentMethod[];
  providers?: PaymentOptions['providers'];
  /** called only from the last screen (Approve / Decline …) */
  onPay: DemoPay;
}

type Screen =
  | { kind: 'choose' }
  | { kind: 'method'; method: PaymentMethod }
  | { kind: 'confirm'; choice: DemoChoice; vpa: string | null }
  | { kind: 'failed' };

/**
 * The trial server's payment (no Razorpay keys there), laid out like Razorpay's window:
 * choose a way to pay → that method's step → approve or decline. Labelled demo on every
 * step; no money moves and no card, bank or wallet is contacted.
 */
export default function DemoPaymentPanel({ amountPaise, methods, providers, onPay }: Props) {
  const [screen, setScreen] = useState<Screen>({ kind: 'choose' });
  const [moved, setMoved] = useState(false); // focus headings only after the buyer moves between steps
  const [busy, setBusy] = useState<'success' | 'failure' | null>(null);
  const go = (s: Screen) => { setScreen(s); setMoved(true); };
  const back = () => {
    if (busy) return;
    if (screen.kind === 'confirm') go({ kind: 'method', method: screen.choice.method });
    else if (screen.kind !== 'choose') go({ kind: 'choose' });
  };

  const answer = async (outcome: 'success' | 'failure') => {
    if (screen.kind !== 'confirm') return;
    setBusy(outcome);
    try {
      const r = await onPay(screen.choice, outcome);
      if (r === 'not_paid') go({ kind: 'failed' });
    } finally {
      setBusy(null);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && screen.kind !== 'choose') { e.preventDefault(); e.stopPropagation(); back(); }
  };

  return (
    <div className="space-y-4" data-testid="demo-payment" onKeyDown={onKeyDown}>
      <DemoBanner />
      {screen.kind === 'choose' && (
        <section className="space-y-3">
          <StepHeading focus={moved}>Choose how to pay {formatPrice(amountPaise)}</StepHeading>
          <PaymentMethodTiles methods={methods} onChoose={(m) => go({ kind: 'method', method: m })} />
        </section>
      )}
      {screen.kind === 'method' && (
        <section className="space-y-3">
          <BackLink label="Change method" onClick={back} />
          <StepHeading focus={moved}>{METHOD_STEP_TITLES[screen.method]}</StepHeading>
          {screen.method === 'upi' && <UpiStep amountPaise={amountPaise} onPay={(vpa) => go({ kind: 'confirm', choice: { method: 'upi' }, vpa })} />}
          {screen.method === 'card' && <CardStep amountPaise={amountPaise} onPay={() => go({ kind: 'confirm', choice: { method: 'card' }, vpa: null })} />}
          {(screen.method === 'netbanking' || screen.method === 'wallet') && (
            <ProviderStep key={screen.method} label={screen.method === 'netbanking' ? 'Choose your bank' : 'Choose your wallet'}
              providers={providers?.[screen.method] ?? []} amountPaise={amountPaise}
              onPay={(provider) => go({ kind: 'confirm', choice: { method: screen.method, provider }, vpa: null })} />
          )}
        </section>
      )}
      {screen.kind === 'confirm' && (
        <section className="space-y-3">
          <BackLink label="Go back" onClick={back} disabled={!!busy} />
          <ConfirmStep choice={screen.choice} vpa={screen.vpa} amountPaise={amountPaise} busy={busy} focus={moved}
            onAnswer={answer} onRestart={() => go({ kind: 'choose' })} />
        </section>
      )}
      {screen.kind === 'failed' && (
        <section className="space-y-3" role="alert">
          <StepHeading focus={moved}>
            <span className="inline-flex items-center gap-2 text-red-800"><XCircle className="w-5 h-5" aria-hidden="true" /> Payment didn&apos;t go through</span>
          </StepHeading>
          <p className="text-sm text-gray-800">Payment didn&apos;t go through. No money was taken. You can try again.</p>
          <button type="button" onClick={() => go({ kind: 'choose' })} className="btn-primary w-full py-3">Try again</button>
        </section>
      )}
    </div>
  );
}
