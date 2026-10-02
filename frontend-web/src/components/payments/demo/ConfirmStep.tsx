import { ShieldCheck, Smartphone, Building2, Wallet } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import type { DemoChoice } from '@/lib/payments/api';
import { DEMO_OTP, UPI_WAIT_SECONDS } from '@/lib/payments/demoCheckout';
import ApproveScreen from './ApproveScreen';
import StepHeading from './StepHeading';

interface Props {
  choice: DemoChoice;
  /** UPI id the request "went" to; null when the QR picture was used */
  vpa: string | null;
  amountPaise: number;
  busy: 'success' | 'failure' | null;
  focus: boolean;
  onAnswer: (outcome: 'success' | 'failure') => void;
  onRestart: () => void;
}

/** What the bank, UPI app or wallet would show: approve or decline (demo). */
export default function ConfirmStep({ choice, vpa, amountPaise, busy, focus, onAnswer, onRestart }: Props) {
  const amount = formatPrice(amountPaise);
  const common = { busy, onAnswer };
  switch (choice.method) {
    case 'upi':
      return (
        <ApproveScreen {...common} approveLabel="Approve (demo)" declineLabel="Decline (demo)" countdownSeconds={UPI_WAIT_SECONDS} onExpired={onRestart}>
          <StepHeading focus={focus}>Approve the payment in your UPI app</StepHeading>
          <p className="text-sm text-gray-700 flex gap-2"><Smartphone className="w-5 h-5 shrink-0 text-brand-600" aria-hidden="true" />
            {vpa ? <span>A request for {amount} went to <strong>{vpa}</strong> (demo). On a real payment you would approve it in your UPI app.</span>
              : <span>On a real payment you would approve {amount} in the UPI app you scanned with. Here, choose below (demo).</span>}
          </p>
        </ApproveScreen>
      );
    case 'card':
      return (
        <ApproveScreen {...common} approveLabel="Submit" declineLabel="Fail (demo)">
          <StepHeading focus={focus}>Bank OTP (demo)</StepHeading>
          <p className="text-sm text-gray-700 flex gap-2"><ShieldCheck className="w-5 h-5 shrink-0 text-brand-600" aria-hidden="true" />
            <span>Your bank would text a one-time password to confirm {amount}. The demo OTP is filled in.</span></p>
          <label className="block">
            <span className="block text-xs font-medium text-gray-700 mb-0.5">One-time password (OTP)</span>
            <input value={DEMO_OTP} readOnly aria-readonly="true" inputMode="numeric" autoComplete="off"
              className="input w-40 tracking-[0.3em] bg-gray-100 text-gray-700" />
          </label>
        </ApproveScreen>
      );
    case 'netbanking':
      return (
        <ApproveScreen {...common} approveLabel="Success" declineLabel="Failure">
          <StepHeading focus={focus}>{choice.provider} (demo) bank page</StepHeading>
          <p className="text-sm text-gray-700 flex gap-2"><Building2 className="w-5 h-5 shrink-0 text-brand-600" aria-hidden="true" />
            <span>This stands in for {choice.provider}&apos;s login page. On a real payment you would sign in and confirm {amount}. Nothing is sent to the bank.</span></p>
        </ApproveScreen>
      );
    case 'wallet':
      return (
        <ApproveScreen {...common} approveLabel="Approve (demo)" declineLabel="Decline (demo)">
          <StepHeading focus={focus}>{choice.provider} wallet (demo)</StepHeading>
          <p className="text-sm text-gray-700 flex gap-2"><Wallet className="w-5 h-5 shrink-0 text-brand-600" aria-hidden="true" />
            <span>Pay {amount} from your {choice.provider} wallet? Nothing is sent to {choice.provider}.</span></p>
        </ApproveScreen>
      );
  }
}
