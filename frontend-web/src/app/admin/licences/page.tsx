'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { fetchLicences, licenceKeys, type Licence } from '@/lib/compliance/licences';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import LicenceTable from '@/components/admin/licences/LicenceTable';
import LicenceFormDialog from '@/components/admin/licences/LicenceFormDialog';
import PartyLicencesSection from '@/components/admin/licences/PartyLicencesSection';

// Licence register with renewal owners (C-07)
export default function AdminLicencesPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({ queryKey: licenceKeys.list, queryFn: fetchLicences });
  const [editing, setEditing] = useState<Licence | null | 'new'>(null);
  return (
    <div>
      <PageHeader
        title="Licence register"
        subtitle="Every licence Dawabag holds, its validity and who renews it — these numbers are shown in the footer, at checkout and on invoices"
        onRefresh={() => refetch()}
        refreshing={isFetching}
        actions={
          <button onClick={() => setEditing('new')} className="btn-primary text-sm inline-flex items-center gap-1">
            <Plus className="w-4 h-4" /> Add licence
          </button>
        }
      />
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No licences recorded yet" />
      {!!data?.length && <LicenceTable rows={data} onEdit={setEditing} />}
      <PartyLicencesSection />
      {editing && <LicenceFormDialog licence={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
