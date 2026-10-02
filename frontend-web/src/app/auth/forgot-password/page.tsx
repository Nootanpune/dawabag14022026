import Link from 'next/link';
import AuthShell from '@/components/auth/AuthShell';
import ForgotPasswordForm from '@/components/auth/ForgotPasswordForm';

export const metadata = { title: 'Forgot password — DAWA BAG' };

/** Forgot password: a code to the registered mobile, then a new password (Sprint 35). */
export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Forgot password" subtitle="Choose a new password with a code sent to your mobile">
      <ForgotPasswordForm />
      <p className="text-center text-sm text-gray-600 mt-5">
        Remembered it? <Link href="/auth/login" className="text-brand-700 font-medium hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  );
}
