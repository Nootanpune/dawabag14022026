'use client';
import { useEffect, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

/**
 * Restores the web session on every page load via POST /auth/refresh (httpOnly
 * cookie) before rendering anything that depends on who is signed in.
 */
export default function SessionBootstrap({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const bootstrap = useAuthStore((s) => s.bootstrap);

  useEffect(() => {
    if (useAuthStore.getState().status === 'unknown') bootstrap();
  }, [bootstrap]);

  if (status === 'unknown') {
    return (
      <div className="min-h-screen flex items-center justify-center" aria-busy="true">
        <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
      </div>
    );
  }
  return <>{children}</>;
}
