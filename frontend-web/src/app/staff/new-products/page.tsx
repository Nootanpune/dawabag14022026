'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import RequireAuth from '@/components/auth/RequireAuth';
import NewProductsQueue from '@/components/staff/newProducts/NewProductsQueue';
import { PHARMACIST_ROLES } from '@/lib/admin/roles';

// Sprint 29: pharmacists (and admins, who may fill details but not approve) complete
// draft products made from partner requests (C-10, C-17, C-19, C-25).
// Sprint 46: ?suggested=1 opens "Drafts with suggestions", high confidence first.
function Queue() {
  return <NewProductsQueue suggested={useSearchParams()?.get('suggested') === '1'} />;
}

export default function NewProductsPage() {
  return (
    <RequireAuth roles={PHARMACIST_ROLES}>
      <Suspense fallback={null}>
        <Queue />
      </Suspense>
    </RequireAuth>
  );
}
