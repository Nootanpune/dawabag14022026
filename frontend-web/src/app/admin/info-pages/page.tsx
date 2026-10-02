'use client';
import RequireAuth from '@/components/auth/RequireAuth';
import PageHeader from '@/components/admin/PageHeader';
import InfoPageEditor from '@/components/admin/infoPages/InfoPageEditor';
import { INFO_PAGES } from '@/lib/infoPages/api';
import { MANAGER_ROLES } from '@/lib/admin/roles';

// Trust pages (Sprint 33): admins publish new versions; every publish audited (C-46).
export default function InfoPagesAdmin() {
  return (
    <RequireAuth roles={MANAGER_ROLES}>
      <PageHeader title="Trust pages" subtitle="Shown from the footer and every product page. Keep every sentence true of how Dawabag works." />
      <div className="space-y-6">
        {INFO_PAGES.map((p) => <InfoPageEditor key={p.key} pageKey={p.key} label={p.label} />)}
      </div>
    </RequireAuth>
  );
}
