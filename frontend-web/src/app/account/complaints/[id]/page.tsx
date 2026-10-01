'use client';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { categoryLabel, fetchGrievance, grievanceKeys } from '@/lib/grievances/api';
import Header from '@/components/layout/Header';
import BackLink from '@/components/admin/BackLink';
import QueryState from '@/components/admin/QueryState';
import GrievanceStatusBadge from '@/components/grievances/GrievanceStatusBadge';
import GrievanceDueDates from '@/components/grievances/GrievanceDueDates';
import MessageThread from '@/components/grievances/MessageThread';
import ReplyBox from '@/components/grievances/ReplyBox';

export default function ComplaintDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: g, isLoading, error } = useQuery({ queryKey: grievanceKeys.one(id), queryFn: () => fetchGrievance(id) });

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6">
        <BackLink href="/account/complaints" label="Complaints" />
        <QueryState isLoading={isLoading} error={error} isEmpty={false} emptyText="" />
        {g && (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-lg font-semibold">{g.subject}</h1>
              <GrievanceStatusBadge status={g.status} />
            </div>
            <p className="text-xs text-gray-500 mb-2">
              Ticket <span className="font-mono">{g.ticket_no}</span> · {categoryLabel(g.category)}
              {g.order_number ? ` · Order ${g.order_number}` : ''}
            </p>
            <div className="mb-4">
              <GrievanceDueDates g={g} />
            </div>
            {g.resolution && (
              <div className="rounded-lg bg-green-50 border border-green-200 p-3 mb-4 text-sm">
                <p className="text-xs font-semibold text-green-800 mb-1">Resolution</p>
                <p className="whitespace-pre-wrap">{g.resolution}</p>
              </div>
            )}
            <div className="card">
              <MessageThread g={g} viewer="buyer" />
              {g.status !== 'closed' && <ReplyBox grievanceId={g.id} placeholder="Add more details or reply to our team" />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
