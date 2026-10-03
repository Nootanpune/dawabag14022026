'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, KeyRound, Loader2, Lock, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import api, { getApiErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { staffHome } from '@/lib/fulfilment/roles';
import { safeNextPath } from '@/lib/auth/nextPath';
import { homeForRole, sendOtp, signInWithOtp, smsNotConfiguredMessage } from '@/lib/auth/otp';
import SmsUnavailableNotice from '@/components/auth/SmsUnavailableNotice';
import type { AuthResponseData } from '@/lib/session';
import AuthShell from '@/components/auth/AuthShell';
import IconField from '@/components/auth/IconField';
import SignInSecondStep from '@/components/twoFactor/SignInSecondStep';
import { isTwoFactorChallenge, type SignInAnswer, type TwoFactorChallenge } from '@/lib/auth/twoFactor';

// Shoppers return to the page that sent them here (?next=/prescriptions); staff go to their portal
const nextPath = () => (typeof window === 'undefined' ? null : safeNextPath(new URLSearchParams(window.location.search).get('next')));

const mobileRule = z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number');
const loginSchema = z.object({ mobile: mobileRule, password: z.string().min(1, 'Password is required') });
const otpMobileSchema = z.object({ mobile: mobileRule });
const otpSchema = z.object({ otp: z.string().regex(/^\d{6}$/, 'The code has 6 digits') });

type LoginForm = z.infer<typeof loginSchema>;
type OTPForm = z.infer<typeof otpSchema>;
type Mode = 'password' | 'otp';

/**
 * Sign in with mobile + password, or mobile + a one-time code (Sprint 35, owner's
 * DAWA BAG mock: logo and tagline on top, rounded fields with icons, labels above).
 * "Forgot password?" resets it with a code. The session is an httpOnly cookie.
 */
export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [mode, setMode] = useState<Mode>('password');
  const [showPassword, setShowPassword] = useState(false);
  const [codeSentTo, setCodeSentTo] = useState('');
  const [smsOff, setSmsOff] = useState<string | null>(null);   // Sprint 40: no SMS provider on this server
  const [isLoading, setIsLoading] = useState(false);
  // Sprint 42: staff / partner logins with two-step sign-in get the code step before any session
  const [challenge, setChallenge] = useState<TwoFactorChallenge | null>(null);

  const loginForm = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });
  const otpMobileForm = useForm<{ mobile: string }>({ resolver: zodResolver(otpMobileSchema) });
  const otpForm = useForm<OTPForm>({ resolver: zodResolver(otpSchema) });

  const goHome = (d: AuthResponseData & { must_change_password?: boolean }) => {
    // A temporary password from Dawabag's admin is replaced before anything else (Sprint 28)
    if (d.must_change_password) return router.push('/auth/change-password');
    router.push(homeForRole(d.role, staffHome, nextPath()));
  };

  const signedIn = (d: AuthResponseData, welcome: string) => {
    login(d);
    toast.success(welcome);
    goHome(d);
  };
  /** A session, or the second step of two-step sign-in (Sprint 42) */
  const afterFirstStep = (d: SignInAnswer, welcome: string) => {
    if (isTwoFactorChallenge(d)) setChallenge(d);
    else signedIn(d, welcome);
  };

  const onLogin = async (data: LoginForm) => {
    setIsLoading(true);
    try {
      const res = await api.post('/auth/login', data);
      afterFirstStep(res.data.data, 'Welcome back!');
    } catch (err: any) {
      const msg = getApiErrorMessage(err, 'Login failed');
      // A mobile not yet verified gets a code first
      if (msg.includes('OTP sent')) {
        setCodeSentTo(data.mobile);
        setMode('otp');
        toast.info('We sent a code to your mobile. Enter it to continue.');
      } else {
        toast.error(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const onSendCode = async ({ mobile }: { mobile: string }) => {
    setIsLoading(true);
    try {
      await sendOtp(mobile);
      setCodeSentTo(mobile);
      toast.info('If this mobile number has an account, we have sent it a code.');
    } catch (err) {
      const off = smsNotConfiguredMessage(err);
      if (off) setSmsOff(off);
      else toast.error(getApiErrorMessage(err, 'Could not send the code'));
    } finally {
      setIsLoading(false);
    }
  };

  const onVerifyOTP = async (data: OTPForm) => {
    setIsLoading(true);
    try {
      afterFirstStep(await signInWithOtp(codeSentTo, data.otp), 'Welcome to Dawabag.');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'The code is wrong or has expired'));
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = (m: Mode) => { setMode(m); setCodeSentTo(''); setSmsOff(null); otpForm.reset(); };

  if (challenge) {
    return (
      <AuthShell title={challenge.two_factor === 'code' ? 'Two-step sign-in' : 'Set up two-step sign-in'} subtitle="Licensed online pharmacy">
        <SignInSecondStep challenge={challenge} onSignedIn={(d) => signedIn(d, 'Welcome back!')}
          onCancel={() => { setChallenge(null); loginForm.reset(); switchMode('password'); }} />
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Sign in" subtitle="Licensed online pharmacy">
      <div className="grid grid-cols-2 gap-1 rounded-full bg-gray-100 p-1 mb-5" role="group" aria-label="How to sign in">
        {(['password', 'otp'] as const).map((m) => (
          <button key={m} type="button" onClick={() => switchMode(m)} aria-pressed={mode === m}
            className={`rounded-full py-2 text-sm font-medium transition-colors ${mode === m ? 'bg-white text-brand-700 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}>
            {m === 'password' ? 'Password' : 'One-time code'}
          </button>
        ))}
      </div>

      {mode === 'password' ? (
        <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4" noValidate>
          <IconField label="Mobile number" icon={Smartphone} prefix="+91" type="tel" inputMode="numeric" maxLength={10}
            placeholder="9876543210" autoComplete="tel-national" error={loginForm.formState.errors.mobile?.message}
            {...loginForm.register('mobile')} />
          <IconField label="Password" icon={Lock} type={showPassword ? 'text' : 'password'} placeholder="••••••••"
            autoComplete="current-password" error={loginForm.formState.errors.password?.message}
            {...loginForm.register('password')}
            trailing={
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'} className="text-gray-500 hover:text-gray-700">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            } />
          <div className="text-right -mt-2">
            <Link href="/auth/forgot-password" className="text-sm font-medium text-brand-700 hover:underline">Forgot password?</Link>
          </div>
          <button type="submit" disabled={isLoading} className="btn-primary w-full py-2.5 flex items-center justify-center gap-2">
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            Sign in
          </button>
        </form>
      ) : smsOff ? (
        <SmsUnavailableNotice message={smsOff} />
      ) : !codeSentTo ? (
        <form onSubmit={otpMobileForm.handleSubmit(onSendCode)} className="space-y-4" noValidate>
          <IconField label="Mobile number" icon={Smartphone} prefix="+91" type="tel" inputMode="numeric" maxLength={10}
            placeholder="9876543210" autoComplete="tel-national" error={otpMobileForm.formState.errors.mobile?.message}
            {...otpMobileForm.register('mobile')} />
          <button type="submit" disabled={isLoading} className="btn-primary w-full py-2.5 flex items-center justify-center gap-2">
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            Send code
          </button>
        </form>
      ) : (
        <form onSubmit={otpForm.handleSubmit(onVerifyOTP)} className="space-y-4" noValidate>
          <p className="text-sm text-gray-600">Enter the 6-digit code sent to +91 {codeSentTo}.</p>
          <IconField label="Code" icon={KeyRound} type="text" inputMode="numeric" maxLength={6} placeholder="000000"
            autoComplete="one-time-code" className="tracking-[0.4em] font-mono" autoFocus
            error={otpForm.formState.errors.otp?.message} {...otpForm.register('otp')} />
          <button type="submit" disabled={isLoading} className="btn-primary w-full py-2.5 flex items-center justify-center gap-2">
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            Verify and sign in
          </button>
          <button type="button" onClick={() => switchMode(mode)} className="w-full text-sm text-gray-600 hover:text-brand-700 text-center">
            Use a different mobile number
          </button>
        </form>
      )}

      <p className="text-center text-sm text-gray-600 mt-5">
        Don&apos;t have an account?{' '}
        <Link href="/auth/register" className="text-brand-700 font-medium hover:underline">Register</Link>
      </p>
    </AuthShell>
  );
}
