'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { fetchMyGrievances, grievanceKeys } from '@/lib/grievances/api';
import Header from '@/components/layout/Header';
import BackLink from '@/components/admin/BackLink';
import QueryState from '@/components/admin/QueryState';
import ComplaintListItem from '@/components/grievances/ComplaintListItem';
import GrievanceOfficerNote from '@/components/grievances/GrievanceOfficerNote';

export default function ComplaintsPage() {
  const { data, isLoading, error } = useQuery({ queryKey: grievanceKeys.mine, queryFn: fetchMyGrievances });
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6">
        <BackLink href="/account" label="My account" />
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-semibold">Complaints</h1>
          <Link href="/account/complaints/new" className="btn-primary text-sm inline-flex items-center gap-1">
            <Plus className="w-4 h-4" /> New complaint
          </Link>
        </div>
        <GrievanceOfficerNote />
        <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="You have not raised any complaints." />
        <div className="space-y-3">
          {data?.map((g) => <ComplaintListItem key={g.id} g={g} />)}
        </div>
      </div>
    </div>
  );
}
