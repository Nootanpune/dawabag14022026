import RequireAuth from '@/components/auth/RequireAuth';
import PractitionerSalesRegister from '@/components/registers/PractitionerSalesRegister';
import { PHARMACIST_ROLES } from '@/lib/admin/roles';

/** Sprint 44: sales to doctors and medical institutions (r.64(2), r.65(9)(b); FDA Pune circular 16/2026). */
export default function PractitionerSalesPage() {
  return (
    <RequireAuth roles={PHARMACIST_ROLES}>
      <PractitionerSalesRegister scope="admin" />
    </RequireAuth>
  );
}
