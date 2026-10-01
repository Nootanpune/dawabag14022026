import type { ReactNode } from 'react';
import RequireAuth from '@/components/auth/RequireAuth';
import AdminShell from '@/components/admin/AdminShell';
import { ADMIN_ROLES } from '@/lib/admin/roles';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth roles={ADMIN_ROLES}>
      <AdminShell>{children}</AdminShell>
    </RequireAuth>
  );
}
