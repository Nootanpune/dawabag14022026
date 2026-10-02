'use client';
import { useId, useState } from 'react';
import { cn } from '@/lib/utils';
import { DEMO_VPA, isValidVpa } from '@/lib/payments/demoCheckout';
import DemoQr from './DemoQr';
import PayButton from './PayButton';

type Way = 'id' | 'qr';

/** UPI: pay to a UPI id (pre-filled demo@upi) or "scan" a demo QR picture. */
export default function UpiStep({ amountPaise, onPay }: { amountPaise: number; onPay: (vpa: string | null) => void }) {
  const [way, setWay] = useState<Way>('id');
  const [vpa, setVpa] = useState(DEMO_VPA);
  const [touched, setTouched] = useState(false);
  const inputId = useId();
  const valid = isValidVpa(vpa);
  const tab = (w: Way, label: string) => (
    <button type="button" role="tab" aria-selected={way === w} onClick={() => setWay(w)}
      className={cn('flex-1 py-2 text-sm font-medium rounded-lg border-2',
        way === w ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-gray-200 bg-white text-gray-700 hover:border-brand-300')}>
      {label}
    </button>
  );
  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="How to pay by UPI" className="flex gap-2">
        {tab('id', 'Pay by UPI ID')}
        {tab('qr', 'Scan QR')}
      </div>
      {way === 'id' ? (
        <div role="tabpanel" className="space-y-1">
          <label htmlFor={inputId} className="block text-sm font-medium text-gray-800">Your UPI ID</label>
          <input id={inputId} value={vpa} onChange={(e) => setVpa(e.target.value)} onBlur={() => setTouched(true)}
            autoComplete="off" spellCheck={false} aria-invalid={touched && !valid} aria-describedby={`${inputId}-hint`}
            className="input w-full" />
          <p id={`${inputId}-hint`} className={cn('text-xs', touched && !valid ? 'text-red-700' : 'text-gray-500')}>
            {touched && !valid ? 'Write it as name@bank, for example demo@upi.' : 'Demo UPI ID filled in for you. Written as name@bank.'}
          </p>
        </div>
      ) : (
        <div role="tabpanel"><DemoQr /></div>
      )}
      <PayButton amountPaise={amountPaise} disabled={way === 'id' && !valid}
        onClick={() => (way === 'id' ? (valid ? onPay(vpa.trim()) : setTouched(true)) : onPay(null))} />
    </div>
  );
}
