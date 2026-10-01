'use client';
import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { adminProductKeys, fetchAdminProducts, type AdminProductRow } from '@/lib/admin/products';
import { TELE_LIST_ROLES } from '@/lib/telemedicine/roles';
import RequireAuth from '@/components/auth/RequireAuth';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import Pager from '@/components/admin/Pager';
import TeleListTable from '@/components/staff/telemedicine/TeleListTable';
import TeleListDialog from '@/components/staff/telemedicine/TeleListDialog';

const LIMIT = 20;

// Pharmacist's classification of medicines under the Telemedicine Practice Guidelines (C-23).
// A doctor cannot prescribe a medicine by teleconsultation until it is classified.
function TeleListScreen() {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AdminProductRow | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(text.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [text]);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: adminProductKeys.list(q, page),
    queryFn: () => fetchAdminProducts(q, page, LIMIT),
    placeholderData: keepPreviousData,
  });
  return (
    <div>
      <PageHeader
        title="Telemedicine lists"
        subtitle="List O: any consultation. List A: first consult by video, re-fills in follow-up. List B: follow-up only. Schedule X / NDPS: always prohibited."
        onRefresh={() => refetch()}
        refreshing={isFetching}
      />
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search by name, generic or SKU" className="input mb-4 max-w-md" />
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.products.length} emptyText="No products found" />
      {!!data?.products.length && <TeleListTable rows={data.products} onEdit={setEditing} />}
      {data && <Pager page={page} limit={LIMIT} total={data.pagination.total} onPage={setPage} />}
      {editing && <TeleListDialog p={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

export default function TelemedicineListsPage() {
  return (
    <RequireAuth roles={TELE_LIST_ROLES}>
      <TeleListScreen />
    </RequireAuth>
  );
}
