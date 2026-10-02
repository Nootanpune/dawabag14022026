'use client';
import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

export const CHANGE_PASSWORD_PATH = '/auth/change-password';

/**
 * A login with a temporary password from Dawabag's admin (Sprint 28) sees only the
 * change-password page until it chooses its own. The server enforces the same rule
 * on every API call; this just takes the person straight to the form.
 */
export default function PasswordChangeGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const mustChange = useAuthStore((s) => s.status === 'signed_in' && !!s.user?.must_change_password);
  const blocked = mustChange && pathname !== CHANGE_PASSWORD_PATH;

  useEffect(() => {
    if (blocked) router.replace(CHANGE_PASSWORD_PATH);
  }, [blocked, router]);

  if (blocked) {
    return (
      <div className="min-h-screen flex items-center justify-center" aria-busy="true">
        <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
      </div>
    );
  }
  return <>{children}</>;
}
