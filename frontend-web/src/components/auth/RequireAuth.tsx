'use client';
import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

interface Props {
  children: ReactNode;
  /** if given, the signed-in user's role must be one of these (others go to '/') */
  roles?: readonly string[];
}

/**
 * Route guard. Runs after SessionBootstrap has resolved the session, so
 * `status` is already signed_in / signed_out here.
 */
export default function RequireAuth({ children, roles }: Props) {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const role = useAuthStore((s) => s.user?.role);

  const signedOut = status === 'signed_out';
  const forbidden = status === 'signed_in' && !!roles && !roles.includes(role ?? '');

  useEffect(() => {
    if (signedOut) router.replace('/auth/login');
    else if (forbidden) router.replace('/');
  }, [signedOut, forbidden, router]);

  if (status !== 'signed_in' || forbidden) {
    return (
      <div className="min-h-screen flex items-center justify-center" aria-busy="true">
        <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
      </div>
    );
  }
  return <>{children}</>;
}
