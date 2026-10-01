'use client';
import { useParams } from 'next/navigation';
import { STORE_ROLES } from '@/lib/purchasing/roles';
import RequireAuth from '@/components/auth/RequireAuth';
import BackLink from '@/components/admin/BackLink';
import CountDetail from '@/components/staff/stock/CountDetail';

export default function StockCountPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireAuth roles={STORE_ROLES}>
      <BackLink href="/staff/stock-counts" label="Stock counts" />
      <CountDetail id={id} />
    </RequireAuth>
  );
}
