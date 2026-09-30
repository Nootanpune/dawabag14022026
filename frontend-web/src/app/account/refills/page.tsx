'use client';
import { useMandates, useRefills } from '@/hooks/useRefills';
import Header from '@/components/layout/Header';
import BackLink from '@/components/admin/BackLink';
import QueryState from '@/components/admin/QueryState';
import RefillCopy from '@/components/refills/RefillCopy';
import RefillCard from '@/components/refills/RefillCard';
import AutoPaySection from '@/components/refills/AutoPaySection';

export default function RefillsPage() {
  const refills = useRefills();
  const mandates = useMandates();

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6">
        <BackLink href="/account" label="My account" />
        <h1 className="text-lg font-semibold mb-3">Refills</h1>
        <div className="mb-4">
          <RefillCopy />
        </div>
        <AutoPaySection mandates={mandates.data ?? []} />
        <QueryState
          isLoading={refills.isLoading}
          error={refills.error}
          isEmpty={!refills.data?.length}
          emptyText="No refills yet. Open a delivered order and choose “Refill every…”."
        />
        <div className="space-y-3">
          {refills.data?.map((r) => (
            <RefillCard key={r.id} refill={r} mandates={mandates.data ?? []} />
          ))}
        </div>
      </div>
    </div>
  );
}
