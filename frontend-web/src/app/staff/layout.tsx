import type { ReactNode } from 'react';
import RequireAuth from '@/components/auth/RequireAuth';
import AdminShell from '@/components/admin/AdminShell';
import { FULFILMENT_ROLES } from '@/lib/fulfilment/roles';

// Staff area: pharmacists, packers, delivery staff and admins.
export default function StaffLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth roles={FULFILMENT_ROLES}>
      <AdminShell section="Staff" homeHref="/staff/fulfilment">
        {children}
      </AdminShell>
    </RequireAuth>
  );
}
