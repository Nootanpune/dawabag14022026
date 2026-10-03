import RequireAuth from '@/components/auth/RequireAuth';
import ProvenancePanel from '@/components/admin/partnerProvenance/ProvenancePanel';
import { MANAGER_ROLES } from '@/lib/admin/roles';

/** Sprint 39: who supplied each partner batch (C-02, C-28). */
export default function PartnerProvenancePage() {
  return (
    <RequireAuth roles={MANAGER_ROLES}>
      <ProvenancePanel />
    </RequireAuth>
  );
}
