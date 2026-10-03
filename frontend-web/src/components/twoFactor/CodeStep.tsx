'use client';
import { useState } from 'react';
import { KeyRound, LifeBuoy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/api';
import { verifySecondStep } from '@/lib/auth/twoFactor';
import type { AuthResponseData } from '@/lib/session';
import IconField from '@/components/auth/IconField';

/** The second step at sign-in: the authenticator code, or a recovery code for a lost phone (Sprint 42). */
export default function CodeStep({ challengeToken, onSignedIn, onCancel }: {
  challengeToken: string; onSignedIn: (s: AuthResponseData) => void; onCancel: () => void;
}) {
  const [recovery, setRecovery] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const v = code.trim();
    if (!recovery && !/^\d{6}$/.test(v)) { setError('The code has 6 digits'); return; }
    if (recovery && v.replace(/[^a-z0-9]/gi, '').length !== 10) { setError('A recovery code looks like abcde-fghjk'); return; }
    setBusy(true);
    setError(null);
    try {
      const s = await verifySecondStep(challengeToken, v);
      if (s.second_step === 'recovery_code') {
        toast.info(`Recovery code used. ${s.recovery_codes_left} left — make new ones under Two-step sign-in if you are running low.`);
      }
      onSignedIn(s);
    } catch (err) {
      setError(getApiErrorMessage(err, 'That code is not right'));
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <p className="text-sm text-gray-600">
        {recovery ? 'Enter one of your recovery codes. Each code works once.' : 'Enter the 6-digit code from your authenticator app.'}
      </p>
      {recovery ? (
        <IconField key="recovery" label="Recovery code" icon={LifeBuoy} name="recovery-code" type="text" maxLength={11}
          placeholder="abcde-fghjk" autoComplete="off" className="font-mono tracking-wider" autoFocus value={code}
          onChange={(e) => setCode(e.target.value)} error={error ?? undefined} />
      ) : (
        <IconField key="totp" label="Authenticator code" icon={KeyRound} name="totp-code" type="text" inputMode="numeric" maxLength={6}
          placeholder="000000" autoComplete="one-time-code" className="tracking-[0.4em] font-mono" autoFocus value={code}
          onChange={(e) => setCode(e.target.value)} error={error ?? undefined} />
      )}
      <button type="submit" disabled={busy} className="btn-primary w-full py-2.5 flex items-center justify-center gap-2">
        {busy && <Loader2 className="w-4 h-4 animate-spin" />} Verify and sign in
      </button>
      <button type="button" onClick={() => { setRecovery(!recovery); setCode(''); setError(null); }}
        className="w-full text-sm text-brand-700 hover:underline text-center">
        {recovery ? 'Use the authenticator code instead' : 'Lost your phone? Use a recovery code'}
      </button>
      <button type="button" onClick={onCancel} className="w-full text-sm text-gray-600 hover:text-brand-700 text-center">
        Cancel and sign in again
      </button>
    </form>
  );
}
