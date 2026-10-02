'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { formatCountdown } from '@/lib/payments/demoCheckout';

interface Props {
  children: ReactNode;
  approveLabel: string;
  declineLabel: string;
  busy: 'success' | 'failure' | null;
  onAnswer: (outcome: 'success' | 'failure') => void;
  /** a request that waits (UPI): counts down, then expires with nothing taken */
  countdownSeconds?: number;
  onExpired?: () => void;
}

/** The last screen of a demo payment: only these buttons call the server. */
export default function ApproveScreen({ children, approveLabel, declineLabel, busy, onAnswer, countdownSeconds, onExpired }: Props) {
  const [left, setLeft] = useState(countdownSeconds ?? 0);
  useEffect(() => {
    if (!countdownSeconds) return;
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [countdownSeconds]);
  const expired = !!countdownSeconds && left === 0;

  return (
    <div className="space-y-3">
      {children}
      {!!countdownSeconds && (
        <p className="text-sm text-gray-700" aria-live="off">
          {expired ? 'This request has expired. No money was taken.' : <>Waiting for approval… <strong className="tabular-nums">{formatCountdown(left)}</strong> left</>}
        </p>
      )}
      {expired ? (
        <button type="button" onClick={onExpired} className="btn-outline w-full py-2.5">Choose a way to pay again</button>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => onAnswer('failure')} disabled={!!busy}
            className="btn-outline py-2.5 flex items-center justify-center gap-2">
            {busy === 'failure' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}{declineLabel}
          </button>
          <button type="button" onClick={() => onAnswer('success')} disabled={!!busy}
            className="btn-primary py-2.5 flex items-center justify-center gap-2">
            {busy === 'success' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}{approveLabel}
          </button>
        </div>
      )}
    </div>
  );
}
