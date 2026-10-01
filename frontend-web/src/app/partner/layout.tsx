import type { ReactNode } from 'react';
import RequireAuth from '@/components/auth/RequireAuth';
import PartnerShell from '@/components/partner/PartnerShell';

/** Partner portal — signed-in marketplace partner logins only (role 'partner'). */
export default function PartnerLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth roles={['partner']}>
      <PartnerShell>{children}</PartnerShell>
    </RequireAuth>
  );
}
