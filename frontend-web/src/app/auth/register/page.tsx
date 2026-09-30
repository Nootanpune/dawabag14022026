'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';

const schema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  mobile: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirm_password: z.string(),
  referral_code: z.string().optional(),
}).refine((d) => d.password === d.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
});

type FormData = z.infer<typeof schema>;

const OTPSchema = z.object({ otp: z.string().length(6, 'OTP must be 6 digits') });
type OTPData = z.infer<typeof OTPSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<'register' | 'otp'>('register');
  const [registeredMobile, setRegisteredMobile] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<FormData>({ resolver: zodResolver(schema) });
  const otpForm = useForm<OTPData>({ resolver: zodResolver(OTPSchema) });

  const onRegister = async (data: FormData) => {
    setIsLoading(true);
    try {
      await api.post('/auth/register', {
        full_name: data.full_name,
        mobile: data.mobile,
        email: data.email || undefined,
        password: data.password,
        role: 'customer',
        referral_code: data.referral_code || undefined,
      });
      setRegisteredMobile(data.mobile);
      setStep('otp');
      toast.success('OTP sent to your mobile number');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const onVerifyOTP = async (data: OTPData) => {
    setIsLoading(true);
    try {
      await api.post('/auth/verify-otp', { mobile: registeredMobile, otp: data.otp });
      toast.success('Registration complete! Please login.');
      router.push('/auth/login');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Invalid OTP');
    } finally {
      setIsLoading(false);
    }
  };

  if (step === 'otp') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-14 h-14 bg-brand-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <span className="text-white font-bold text-2xl">D</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">dawabag</h1>
          </div>
          <div className="card shadow-sm">
            <h2 className="text-lg font-semibold mb-2">Verify your mobile</h2>
            <p className="text-sm text-gray-500 mb-5">
              OTP sent to +91 {registeredMobile}
            </p>
            <form onSubmit={otpForm.handleSubmit(onVerifyOTP)} className="space-y-4">
              <input
                {...otpForm.register('otp')}
                type="text"
                maxLength={6}
                autoFocus
                placeholder="000000"
                className="input text-center text-2xl tracking-[0.5em] font-mono"
              />
              {otpForm.formState.errors.otp && (
                <p className="text-xs text-red-500">{otpForm.formState.errors.otp.message}</p>
              )}
              <button type="submit" disabled={isLoading}
                className="btn-primary w-full py-2.5 flex items-center justify-center gap-2">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Verify & complete registration
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-brand-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <span className="text-white font-bold text-2xl">D</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Create account</h1>
          <p className="text-sm text-gray-500 mt-1">Join Dawabag today</p>
        </div>
        <div className="card shadow-sm">
          <form onSubmit={form.handleSubmit(onRegister)} className="space-y-4">
            {/* Full name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
              <input {...form.register('full_name')} placeholder="Rajesh Shah" className="input" />
              {form.formState.errors.full_name && (
                <p className="text-xs text-red-500 mt-1">{form.formState.errors.full_name.message}</p>
              )}
            </div>

            {/* Mobile */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mobile number</label>
              <div className="flex">
                <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">+91</span>
                <input {...form.register('mobile')} type="tel" maxLength={10} placeholder="9876543210" className="input rounded-l-none" />
              </div>
              {form.formState.errors.mobile && (
                <p className="text-xs text-red-500 mt-1">{form.formState.errors.mobile.message}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email <span className="text-gray-400">(optional)</span></label>
              <input {...form.register('email')} type="email" placeholder="rajesh@example.com" className="input" />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <div className="relative">
                <input {...form.register('password')} type={showPassword ? 'text' : 'password'} placeholder="Min. 8 characters" className="input pr-10" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {form.formState.errors.password && (
                <p className="text-xs text-red-500 mt-1">{form.formState.errors.password.message}</p>
              )}
            </div>

            {/* Confirm password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
              <input {...form.register('confirm_password')} type="password" placeholder="Re-enter password" className="input" />
              {form.formState.errors.confirm_password && (
                <p className="text-xs text-red-500 mt-1">{form.formState.errors.confirm_password.message}</p>
              )}
            </div>

            {/* Referral code */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Referral code <span className="text-gray-400">(optional)</span></label>
              <input {...form.register('referral_code')} placeholder="e.g. RAJA20" className="input uppercase" />
            </div>

            <button type="submit" disabled={isLoading}
              className="btn-primary w-full py-2.5 flex items-center justify-center gap-2">
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              Create account
            </button>
          </form>
          <p className="text-center text-sm text-gray-500 mt-4">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-brand-600 font-medium hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
