'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import SessionBootstrap from '@/components/auth/SessionBootstrap';
import PasswordChangeGate from '@/components/auth/PasswordChangeGate';
import { useTrackPages } from '@/lib/layout/navHistory';

export function Providers({ children }: { children: React.ReactNode }) {
  useTrackPages();   // for the header's Back arrow (memory only)
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SessionBootstrap>
        <PasswordChangeGate>{children}</PasswordChangeGate>
      </SessionBootstrap>
    </QueryClientProvider>
  );
}
