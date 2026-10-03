'use client';
import { useEffect, useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { getApiErrorMessage } from '@/lib/api';
import { confirmEnrolment, startEnrolment, type Enrolment, type SessionWithCodes } from '@/lib/auth/twoFactor';
import IconField from '@/components/auth/IconField';

/**
 * Setting up an authenticator app (Sprint 42): the server draws the QR code (no outside
 * QR service) and gives the key as text for typing in; the first code from the app
 * switches it on. Signed in (no challenge) or straight after a sign-in that requires it.
 */
export default function EnrolPanel({ challengeToken, onEnrolled }: { challengeToken?: string; onEnrolled: (s: SessionWithCodes) => void }) {
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    startEnrolment(challengeToken)
      .then((e) => { if (live) setEnrolment(e); })
      .catch((err) => { if (live) setLoadError(getApiErrorMessage(err, 'Could not start setting up two-step sign-in')); });
    return () => { live = false; };
  }, [challengeToken]);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) { setError('Enter the 6-digit code from the app'); return; }
    setBusy(true);
    setError(null);
    try {
      onEnrolled(await confirmEnrolment(code, challengeToken));
    } catch (err) {
      setError(getApiErrorMessage(err, 'That code is not right'));
    } finally { setBusy(false); }
  };

  if (loadError) return <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3" role="alert">{loadError}</p>;
  if (!enrolment) return <div className="flex justify-center py-8" aria-busy="true"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>;

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <ol className="text-sm text-gray-700 list-decimal pl-5 space-y-1">
        <li>Open an authenticator app on your phone (Google Authenticator, Microsoft Authenticator, Authy or similar).</li>
        <li>Add an account and scan this QR code.</li>
        <li>Type the 6-digit code the app shows.</li>
      </ol>
      <div className="flex justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- an inline SVG data URL from our own server */}
        <img src={enrolment.qr_svg_data_url} alt="QR code to scan with your authenticator app" width={192} height={192}
          className="w-48 h-48 border border-gray-200 rounded-xl bg-white p-2" data-testid="two-factor-qr" />
      </div>
      <div className="text-center">
        <p className="text-xs text-gray-600">Cannot scan? Enter this key in the app ({enrolment.issuer}, time-based):</p>
        <p className="font-mono text-sm tracking-wider break-all select-all mt-1" data-testid="two-factor-secret">{enrolment.secret}</p>
      </div>
      <IconField label="Code from the app" icon={KeyRound} name="enrol-code" type="text" inputMode="numeric" maxLength={6}
        placeholder="000000" autoComplete="one-time-code" className="tracking-[0.4em] font-mono" value={code}
        onChange={(e) => setCode(e.target.value)} error={error ?? undefined} />
      <button type="submit" disabled={busy} className="btn-primary w-full py-2.5 flex items-center justify-center gap-2">
        {busy && <Loader2 className="w-4 h-4 animate-spin" />} Switch on two-step sign-in
      </button>
    </form>
  );
}
