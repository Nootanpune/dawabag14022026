import type { ReactNode } from 'react';
import RequireAuth from '@/components/auth/RequireAuth';
import { MANAGER_ROLES } from '@/lib/admin/roles';

// Regulator recall alerts are admin / super_admin only, as on the server (C-28)
export default function RecallAlertsLayout({ children }: { children: ReactNode }) {
  return <RequireAuth roles={MANAGER_ROLES}>{children}</RequireAuth>;
}
