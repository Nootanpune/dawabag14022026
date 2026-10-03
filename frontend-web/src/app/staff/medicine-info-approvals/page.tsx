'use client';
import RequireAuth from '@/components/auth/RequireAuth';
import PageHeader from '@/components/admin/PageHeader';
import InfoReviewQueue from '@/components/staff/medicineInfo/InfoReviewQueue';
import InfoReturnedList from '@/components/staff/medicineInfo/InfoReturnedList';
import ImportedDraftCounts from '@/components/staff/medicineInfo/imports/ImportedDraftCounts';
import { PHARMACIST_ROLES } from '@/lib/admin/roles';

// Sprint 36 — medicine information needs a second pharmacist (owner decision
// 2026-10-03, four eyes; C-17, C-19, C-46): what waits for approval, and what was
// returned to the viewer with a reason.
export default function MedicineInfoApprovalsPage() {
  return (
    <RequireAuth roles={PHARMACIST_ROLES}>
      <PageHeader title="Medicine information to approve"
        subtitle="Uses, side effects and warnings are shown to buyers only after a second registered pharmacist approves them" />
      {/* Sprint 45: imported drafts per partner (to check / waiting) */}
      <div className="mt-4"><ImportedDraftCounts /></div>
      <InfoReviewQueue />
      <InfoReturnedList />
    </RequireAuth>
  );
}
