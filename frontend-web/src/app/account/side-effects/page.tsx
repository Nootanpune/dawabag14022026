'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { adrKeys, fetchMyAdrs, labelOf, SERIOUSNESS } from '@/lib/compliance/adverseEvents';
import Header from '@/components/layout/Header';
import BackLink from '@/components/admin/BackLink';
import QueryState from '@/components/admin/QueryState';
import StatusBadge from '@/components/admin/StatusBadge';
import { formatDateTimeIST } from '@/lib/dates';

// Side-effect reports the buyer has made (C-29)
export default function MySideEffectsPage() {
  const { data, isLoading, error } = useQuery({ queryKey: adrKeys.mine, queryFn: fetchMyAdrs });
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6">
        <BackLink href="/account" label="My account" />
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-semibold">Side-effect reports</h1>
          <Link href="/account/side-effects/new" className="btn-primary text-sm inline-flex items-center gap-1">
            <Plus className="w-4 h-4" /> Report a side effect
          </Link>
        </div>
        <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="You have not reported any side effects." />
        <div className="space-y-3">
          {data?.map((r) => (
            <Link key={r.id} href={`/account/side-effects/${r.id}`} className="card block hover:shadow-md">
              <div className="flex justify-between gap-2">
                <p className="font-medium text-sm">{r.product_name}</p>
                <StatusBadge status={r.status} />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {r.report_no} · {labelOf(SERIOUSNESS, r.seriousness)} · {formatDateTimeIST(r.created_at)}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
