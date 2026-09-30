import type { ReactNode } from 'react';
import RequireAuth from '@/components/auth/RequireAuth';

export default function OrdersLayout({ children }: { children: ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}
