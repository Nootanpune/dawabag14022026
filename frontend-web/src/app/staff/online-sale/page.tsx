import RequireAuth from '@/components/auth/RequireAuth';
import OnlineSalePanel from '@/components/staff/onlineSale/OnlineSalePanel';
import { PHARMACIST_ROLES } from '@/lib/admin/roles';

/** Sprint 39: online-sale status per product — pharmacists allow, pharmacists and admins stop (C-10). */
export default function OnlineSalePage() {
  return (
    <RequireAuth roles={PHARMACIST_ROLES}>
      <OnlineSalePanel />
    </RequireAuth>
  );
}
