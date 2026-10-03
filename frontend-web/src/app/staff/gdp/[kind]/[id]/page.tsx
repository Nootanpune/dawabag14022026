'use client';
import { useParams } from 'next/navigation';
import GdpBatchLog from '@/components/gdp/GdpBatchLog';
import { useAuthStore } from '@/store/authStore';
import { hasRole } from '@/lib/admin/roles';
import { STORE_ROLES } from '@/lib/purchasing/roles';

/** Sprint 40: one batch's GDP log; store staff record on Dawabag's batches (C-25). */
export default function StaffGdpBatchPage() {
  const { kind, id } = useParams<{ kind: string; id: string }>();
  const role = useAuthStore((s) => s.user?.role);
  const k = kind === 'partner' ? 'partner' : 'own';
  return <GdpBatchLog portal={false} kind={k} id={id} canRecord={k === 'own' && hasRole(role, STORE_ROLES)} />;
}
