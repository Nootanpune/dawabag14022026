'use client';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { categoryLabel, fetchGrievance, grievanceKeys } from '@/lib/grievances/api';
import BackLink from '@/components/admin/BackLink';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import GrievanceStatusBadge from '@/components/grievances/GrievanceStatusBadge';
import GrievanceDueDates from '@/components/grievances/GrievanceDueDates';
import MessageThread from '@/components/grievances/MessageThread';
import ReplyBox from '@/components/grievances/ReplyBox';
import GrievanceStatusForm from '@/components/admin/grievances/GrievanceStatusForm';

export default function AdminGrievancePage() {
  const { id } = useParams<{ id: string }>();
  const { data: g, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: grievanceKeys.one(id),
    queryFn: () => fetchGrievance(id),
  });

  return (
    <div>
      <BackLink href="/admin/grievances" label="Complaints" />
      <QueryState isLoading={isLoading} error={error} isEmpty={false} emptyText="" />
      {g && (
        <>
          <PageHeader
            title={g.subject}
            subtitle={
              <>
                <span className="font-mono">{g.ticket_no}</span> · {categoryLabel(g.category)}
                {g.order_number ? ` · Order ${g.order_number}` : ''}
                {g.buyer_name ? ` · ${g.buyer_name}` : ''}
              </>
            }
            onRefresh={() => refetch()}
            refreshing={isFetching}
            actions={<GrievanceStatusBadge status={g.status} />}
          />
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="card lg:col-span-2">
              <MessageThread g={g} viewer="staff" />
              {g.status !== 'closed' && (
                <ReplyBox grievanceId={g.id} placeholder="Reply to the buyer (the first reply acknowledges the complaint)" />
              )}
            </div>
            <div className="space-y-4">
              <div className="card">
                <p className="text-sm font-semibold mb-2">Deadlines</p>
                <GrievanceDueDates g={g} compact />
              </div>
              {g.resolution && (
                <div className="card text-sm">
                  <p className="font-semibold mb-1">Resolution</p>
                  <p className="whitespace-pre-wrap text-gray-700">{g.resolution}</p>
                </div>
              )}
              <div className="card">
                <GrievanceStatusForm key={g.status} g={g} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
