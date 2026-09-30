'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import api, { getApiErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

const loginSchema = z.object({
  mobile: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
  password: z.string().min(1, 'Password is required'),
});

const otpSchema = z.object({
  otp: z.string().length(6, 'OTP must be 6 digits'),
});

type LoginForm = z.infer<typeof loginSchema>;
type OTPForm = z.infer<typeof otpSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [needsOTP, setNeedsOTP] = useState(false);
  const [mobileForOTP, setMobileForOTP] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const loginForm = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });
  const otpForm = useForm<OTPForm>({ resolver: zodResolver(otpSchema) });

  const onLogin = async (data: LoginForm) => {
    setIsLoading(true);
    try {
      const res = await api.post('/auth/login', data);
      login(res.data.data);
      toast.success('Welcome back!');
      const role = res.data.data.role;
      if (role === 'admin' || role === 'super_admin') router.push('/admin');
      else if (role === 'doctor') router.push('/doctor/dashboard');
      // Order-fulfilment screens are not built yet; pharmacists work the KYC queue
      else if (role === 'pharmacist_rx') router.push('/admin/kyc');
      else router.push('/');
    } catch (err: any) {
      const msg = getApiErrorMessage(err, 'Login failed');
      if (msg.includes('OTP sent')) {
        setMobileForOTP(data.mobile);
        setNeedsOTP(true);
        toast.info('OTP sent to your mobile. Please verify.');
      } else {
        toast.error(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const onVerifyOTP = async (data: OTPForm) => {
    setIsLoading(true);
    try {
      const res = await api.post('/auth/verify-otp', { mobile: mobileForOTP, otp: data.otp });
      login(res.data.data);
      toast.success('Mobile verified! Welcome to Dawabag.');
      router.push('/');
    } catch (err: any) {
      toast.error(getApiErrorMessage(err, 'Invalid OTP'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-brand-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <span className="text-white font-bold text-2xl">D</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">dawabag</h1>
          <p className="text-sm text-gray-500 mt-1">Your trusted online pharmacy</p>
        </div>

        <div className="card shadow-sm">
          {!needsOTP ? (
            <>
              <h2 className="text-lg font-semibold mb-5">Sign in</h2>
              <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Mobile number
                  </label>
                  <div className="flex">
                    <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0
                                     border-gray-300 bg-gray-50 text-gray-500 text-sm">+91</span>
                    <input
                      {...loginForm.register('mobile')}
                      type="tel"
                      maxLength={10}
                      placeholder="9876543210"
                      className="input rounded-l-none"
                    />
                  </div>
                  {loginForm.formState.errors.mobile && (
                    <p className="text-xs text-red-500 mt-1">{loginForm.formState.errors.mobile.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <div className="relative">
                    <input
                      {...loginForm.register('password')}
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      className="input pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {loginForm.formState.errors.password && (
                    <p className="text-xs text-red-500 mt-1">{loginForm.formState.errors.password.message}</p>
                  )}
                </div>

                <button type="submit" disabled={isLoading} className="btn-primary w-full py-2.5 flex items-center justify-center gap-2">
                  {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Sign in
                </button>
              </form>

              <p className="text-center text-sm text-gray-500 mt-4">
                Don't have an account?{' '}
                <Link href="/auth/register" className="text-brand-600 font-medium hover:underline">
                  Register
                </Link>
              </p>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold mb-2">Verify mobile</h2>
              <p className="text-sm text-gray-500 mb-5">
                Enter the 6-digit OTP sent to +91 {mobileForOTP}
              </p>
              <form onSubmit={otpForm.handleSubmit(onVerifyOTP)} className="space-y-4">
                <div>
                  <input
                    {...otpForm.register('otp')}
                    type="text"
                    maxLength={6}
                    placeholder="000000"
                    className="input text-center text-2xl tracking-[0.5em] font-mono"
                    autoFocus
                  />
                  {otpForm.formState.errors.otp && (
                    <p className="text-xs text-red-500 mt-1">{otpForm.formState.errors.otp.message}</p>
                  )}
                </div>
                <button type="submit" disabled={isLoading} className="btn-primary w-full py-2.5 flex items-center justify-center gap-2">
                  {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Verify OTP
                </button>
                <button type="button" onClick={() => setNeedsOTP(false)}
                  className="w-full text-sm text-gray-500 hover:text-brand-600 text-center">
                  ← Back to login
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
