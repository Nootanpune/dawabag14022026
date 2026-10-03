'use client';
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { AuthResponseData } from '@/lib/session';
import type { SessionWithCodes, TwoFactorChallenge } from '@/lib/auth/twoFactor';
import CodeStep from './CodeStep';
import EnrolPanel from './EnrolPanel';
import RecoveryCodes from './RecoveryCodes';

/**
 * After the password, SMS code or password reset of a staff or partner login (Sprint 42):
 * the authenticator code, or — when two-step sign-in is required and not set up yet —
 * setting it up, then the recovery codes. The session starts only at the end.
 */
export default function SignInSecondStep({ challenge, onSignedIn, onCancel }: {
  challenge: TwoFactorChallenge; onSignedIn: (s: AuthResponseData) => void; onCancel: () => void;
}) {
  const [enrolled, setEnrolled] = useState<SessionWithCodes | null>(null);
  return (
    <div className="space-y-4" data-testid="two-factor-step">
      <div className="flex items-start gap-2 rounded-xl bg-brand-50 border border-brand-100 p-3">
        <ShieldCheck className="w-5 h-5 text-brand-700 shrink-0" aria-hidden="true" />
        <p className="text-sm text-gray-800">
          {challenge.two_factor === 'code'
            ? 'Two-step sign-in is on for this login.'
            : 'Two-step sign-in is required for your login. Set up an authenticator app to continue.'}
        </p>
      </div>
      {challenge.two_factor === 'code' ? (
        <CodeStep challengeToken={challenge.challenge_token} onSignedIn={onSignedIn} onCancel={onCancel} />
      ) : enrolled ? (
        <RecoveryCodes codes={enrolled.recovery_codes} onDone={() => onSignedIn(enrolled)} doneLabel="Continue to Dawabag" />
      ) : (
        <>
          <EnrolPanel challengeToken={challenge.challenge_token} onEnrolled={setEnrolled} />
          <button type="button" onClick={onCancel} className="w-full text-sm text-gray-600 hover:text-brand-700 text-center">
            Cancel and sign in again
          </button>
        </>
      )}
    </div>
  );
}
