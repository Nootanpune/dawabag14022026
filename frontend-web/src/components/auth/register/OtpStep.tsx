'use client';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, Loader2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import api, { getApiErrorMessage, type AuthResponseData } from '@/lib/api';

const otpSchema = z.object({ otp: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits') });
type OTPForm = z.infer<typeof otpSchema>;

const RESEND_COOLDOWN_SECONDS = 30;

interface Props {
  mobile: string;
  onVerified: (data: AuthResponseData) => void | Promise<void>;
  onBack?: () => void;
}

export default function OtpStep({ mobile, onVerified, onBack }: Props) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OTPForm>({ resolver: zodResolver(otpSchema), defaultValues: { otp: '' } });

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const onSubmit = async ({ otp }: OTPForm) => {
    setIsVerifying(true);
    setServerError('');
    try {
      const res = await api.post('/auth/verify-otp', { mobile, otp });
      await onVerified({ ...res.data.data, mobile: res.data.data?.mobile ?? mobile });
    } catch (err: any) {
      const msg = getApiErrorMessage(err, 'Invalid OTP');
      setServerError(msg);
      toast.error(msg);
    } finally {
      setIsVerifying(false);
    }
  };

  const resend = async () => {
    setIsResending(true);
    setServerError('');
    try {
      await api.post('/auth/send-otp', { mobile });
      toast.success('A new OTP has been sent');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err: any) {
      const msg = getApiErrorMessage(err, 'Could not resend OTP');
      setServerError(msg);
      toast.error(msg);
    } finally {
      setIsResending(false);
    }
  };

  const otpField = register('otp');

  return (
    <div>
      <h2 className="text-lg font-semibold mb-2">Verify your mobile</h2>
      <p className="text-sm text-gray-500 mb-5">Enter the 6-digit OTP sent to +91 {mobile}</p>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <input
            {...otpField}
            onChange={(e) => {
              e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
              return otpField.onChange(e);
            }}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            placeholder="000000"
            className="input text-center text-2xl tracking-[0.5em] font-mono"
          />
          {errors.otp && <p className="text-xs text-red-500 mt-1">{errors.otp.message}</p>}
          {serverError && !errors.otp && <p className="text-xs text-red-500 mt-1">{serverError}</p>}
        </div>

        <button
          type="submit"
          disabled={isVerifying}
          className="btn-primary w-full py-2.5 flex items-center justify-center gap-2"
        >
          {isVerifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Verify OTP
        </button>

        <div className="flex items-center justify-between text-sm">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              disabled={isVerifying}
              className="text-gray-500 hover:text-brand-600 inline-flex items-center gap-1"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          ) : (
            <span />
          )}
          {cooldown > 0 ? (
            <span className="text-gray-400">Resend OTP in {cooldown}s</span>
          ) : (
            <button
              type="button"
              onClick={resend}
              disabled={isResending}
              className="text-brand-600 font-medium hover:underline inline-flex items-center gap-1 disabled:opacity-50"
            >
              {isResending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Resend OTP
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
