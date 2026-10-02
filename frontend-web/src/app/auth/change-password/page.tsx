'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { KeyRound, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { loginHref } from '@/lib/auth/nextPath';
import { staffHome } from '@/lib/fulfilment/roles';
import ChangePasswordForm from '@/components/auth/ChangePasswordForm';
import type { AuthResponseData } from '@/lib/session';

// Where each kind of login lands once its password is changed (as after signing in)
function homeFor(role: string): string {
  if (role === 'admin' || role === 'super_admin') return '/admin';
  if (role === 'partner') return '/partner';
  if (role === 'doctor') return '/doctor';
  if (['pharmacist_rx', 'pharmacist_pack', 'delivery'].includes(role)) return staffHome(role);
  return '/';
}

/** Change password — required first after signing in with a temporary password (Sprint 28). */
export default function ChangePasswordPage() {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const login = useAuthStore((s) => s.login);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    if (status === 'signed_out') router.replace(loginHref('/auth/change-password'));
  }, [status, router]);

  if (status !== 'signed_in' || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center" aria-busy="true">
        <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
      </div>
    );
  }

  const forced = !!user.must_change_password;
  const done = (session: AuthResponseData) => {
    login(session);
    toast.success('Password changed');
    router.replace(homeFor(session.role));
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="card shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <KeyRound className="w-5 h-5 text-brand-600" aria-hidden="true" />
            <h1 className="text-lg font-semibold">{forced ? 'Choose your own password' : 'Change password'}</h1>
          </div>
          {forced && (
            <p className="text-sm text-gray-600 mb-4">
              You signed in with a temporary password from Dawabag. Choose a new password that only you know before you
              continue. You will use it every time you sign in.
            </p>
          )}
          <ChangePasswordForm mobile={user.mobile} onChanged={done} />
          <button
            type="button"
            onClick={async () => {
              await logout();
              router.replace('/auth/login');
            }}
            className="w-full text-center text-sm text-gray-500 mt-4 hover:text-brand-600"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
