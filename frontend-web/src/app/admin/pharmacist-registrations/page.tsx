import RequireAuth from '@/components/auth/RequireAuth';
import RegistrationsPanel from '@/components/admin/pharmacistRegistrations/RegistrationsPanel';
import { MANAGER_ROLES } from '@/lib/admin/roles';

/** Sprint 39: pharmacist registration validity — Dawabag's and partners' pharmacists (C-03, C-08). */
export default function PharmacistRegistrationsPage() {
  return (
    <RequireAuth roles={MANAGER_ROLES}>
      <RegistrationsPanel />
    </RequireAuth>
  );
}
