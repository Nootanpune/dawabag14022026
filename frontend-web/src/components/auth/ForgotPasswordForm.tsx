'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { CheckCircle2, KeyRound, Loader2, Lock, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/api';
import { homeForRole, resetPassword, sendOtp, smsNotConfiguredMessage } from '@/lib/auth/otp';
import SmsUnavailableNotice from './SmsUnavailableNotice';
import { staffHome } from '@/lib/fulfilment/roles';
import { useAuthStore } from '@/store/authStore';
import IconField from './IconField';

const mobileSchema = z.object({ mobile: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number') });
// Same rules as the server (utils/passwordPolicy.ts); the server has the last word
const resetSchema = z.object({
  otp: z.string().regex(/^\d{6}$/, 'The code has 6 digits'),
  password: z.string().min(8, 'At least 8 characters').max(72, 'At most 72 characters')
    .regex(/[A-Za-z]/, 'Include at least one letter').regex(/\d/, 'Include at least one number'),
  confirm: z.string(),
}).refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'The two passwords are not the same' });

/**
 * Forgot password (Sprint 35): mobile → a one-time code → the code and a new password
 * twice → signed in. Every other session of the account ends on the server.
 */
export default function ForgotPasswordForm() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const [mobile, setMobile] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [smsOff, setSmsOff] = useState<string | null>(null);   // Sprint 40: no SMS provider on this server
  const mobileForm = useForm<{ mobile: string }>({ resolver: zodResolver(mobileSchema) });
  const resetForm = useForm<z.infer<typeof resetSchema>>({ resolver: zodResolver(resetSchema) });

  const onSend = async ({ mobile: m }: { mobile: string }) => {
    setBusy(true);
    try {
      await sendOtp(m);
      setMobile(m);
    } catch (err) {
      const off = smsNotConfiguredMessage(err);
      if (off) setSmsOff(off);
      else toast.error(getApiErrorMessage(err, 'Could not send the code'));
    } finally { setBusy(false); }
  };

  const onReset = async (v: z.infer<typeof resetSchema>) => {
    setBusy(true);
    try {
      const d = await resetPassword(mobile, v.otp, v.password);
      login(d);
      setDone(true);
      setTimeout(() => router.push(homeForRole(d.role, staffHome, null)), 1500);
    } catch (err) {
      resetForm.setError('otp', { message: getApiErrorMessage(err, 'The code is wrong or has expired') });
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <div className="text-center py-4" role="status">
        <CheckCircle2 className="w-10 h-10 text-brand-600 mx-auto mb-2" aria-hidden="true" />
        <p className="font-semibold">Password changed</p>
        <p className="text-sm text-gray-600 mt-1">You are signed in. Other devices have been signed out.</p>
      </div>
    );
  }

  if (smsOff) return <SmsUnavailableNotice message={smsOff} showPasswordLink />;

  if (!mobile) {
    return (
      <form onSubmit={mobileForm.handleSubmit(onSend)} className="space-y-4" noValidate>
        <p className="text-sm text-gray-600">Enter the mobile number of your account. We will send it a 6-digit code.</p>
        <IconField label="Mobile number" icon={Smartphone} prefix="+91" type="tel" inputMode="numeric" maxLength={10}
          placeholder="9876543210" autoComplete="tel-national" error={mobileForm.formState.errors.mobile?.message}
          {...mobileForm.register('mobile')} />
        <button type="submit" disabled={busy} className="btn-primary w-full py-2.5 flex items-center justify-center gap-2">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Send code
        </button>
      </form>
    );
  }

  const e = resetForm.formState.errors;
  return (
    <form onSubmit={resetForm.handleSubmit(onReset)} className="space-y-4" noValidate>
      <p className="text-sm text-gray-600" role="status">
        If +91 {mobile} has an account, we have sent it a code. It works for 10 minutes.
      </p>
      <IconField label="Code" icon={KeyRound} type="text" inputMode="numeric" maxLength={6} placeholder="000000"
        autoComplete="one-time-code" className="tracking-[0.4em] font-mono" error={e.otp?.message} {...resetForm.register('otp')} />
      <IconField label="New password" icon={Lock} type="password" autoComplete="new-password"
        hint="At least 8 characters, with a letter and a number" error={e.password?.message} {...resetForm.register('password')} />
      <IconField label="New password again" icon={Lock} type="password" autoComplete="new-password"
        error={e.confirm?.message} {...resetForm.register('confirm')} />
      <button type="submit" disabled={busy} className="btn-primary w-full py-2.5 flex items-center justify-center gap-2">
        {busy && <Loader2 className="w-4 h-4 animate-spin" />} Change password
      </button>
      <button type="button" onClick={() => { setMobile(''); resetForm.reset(); }} className="w-full text-sm text-gray-600 hover:text-brand-700">
        Use a different mobile number
      </button>
    </form>
  );
}
