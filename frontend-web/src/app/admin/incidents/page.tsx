'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, AlertTriangle } from 'lucide-react';
import { fetchIncidents, incidentKeys, type Incident, type IncidentStatus } from '@/lib/compliance/incidents';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import StatusTabs from '@/components/admin/StatusTabs';
import IncidentCard from '@/components/admin/incidents/IncidentCard';
import NewIncidentDialog from '@/components/admin/incidents/NewIncidentDialog';
import UpdateIncidentDialog from '@/components/admin/incidents/UpdateIncidentDialog';

const TABS = [
  { value: 'open', label: 'Open' },
  { value: 'contained', label: 'Contained' },
  { value: 'closed', label: 'Closed' },
  { value: '', label: 'All' },
] as const;

// Security incident register with the 6-hour CERT-In clock (C-43).
export default function IncidentsPage() {
  const [status, setStatus] = useState<IncidentStatus | ''>('open');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Incident | null>(null);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: incidentKeys.list(status),
    queryFn: () => fetchIncidents(status || undefined),
    refetchInterval: 60000,
  });
  const overdue = data?.filter((i) => i.cert_in_overdue).length ?? 0;

  return (
    <div>
      <PageHeader
        title="Security incidents"
        subtitle="Report to CERT-In within 6 hours of detection; personal-data breaches also go to the Data Protection Board and users"
        onRefresh={() => refetch()}
        refreshing={isFetching}
        actions={
          <button onClick={() => setCreating(true)} className="btn-primary text-sm inline-flex items-center gap-1">
            <Plus className="w-4 h-4" /> Log incident
          </button>
        }
      />
      {overdue > 0 && (
        <p className="flex items-center gap-2 text-sm font-semibold text-white bg-red-600 rounded-lg p-3 mb-4">
          <AlertTriangle className="w-5 h-5" /> {overdue} incident(s) past the 6-hour CERT-In deadline — report now.
        </p>
      )}
      <StatusTabs tabs={TABS} value={status} onChange={setStatus} />
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No incidents" />
      <div className="space-y-3">
        {data?.map((i) => <IncidentCard key={i.id} incident={i} onUpdate={setEditing} />)}
      </div>
      {creating && <NewIncidentDialog onClose={() => setCreating(false)} />}
      {editing && <UpdateIncidentDialog incident={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
