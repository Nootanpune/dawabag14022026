import RequireAuth from '@/components/auth/RequireAuth';
import PractitionersPanel from '@/components/admin/practitioners/PractitionersPanel';
import { PHARMACIST_ROLES } from '@/lib/admin/roles';

/** Sprint 44: doctor / institution registrations to verify (r.65(9)(b); FDA Pune circular 16/2026). */
export default function PractitionersPage() {
  return (
    <RequireAuth roles={PHARMACIST_ROLES}>
      <PractitionersPanel />
    </RequireAuth>
  );
}
