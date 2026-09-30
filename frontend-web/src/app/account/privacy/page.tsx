'use client';
import { useQuery } from '@tanstack/react-query';
import { fetchConsents, privacyKeys } from '@/lib/privacy/api';
import Header from '@/components/layout/Header';
import BackLink from '@/components/admin/BackLink';
import QueryState from '@/components/admin/QueryState';
import ConsentStatus from '@/components/privacy/ConsentStatus';
import ConsentHistory from '@/components/privacy/ConsentHistory';
import DownloadMyData from '@/components/privacy/DownloadMyData';
import DataRequestForm from '@/components/privacy/DataRequestForm';

// Personal-data rights (DPDP Act 2023, C-40..C-44)
export default function PrivacyPage() {
  const { data, isLoading, error } = useQuery({ queryKey: privacyKeys.consents, queryFn: fetchConsents });
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6">
        <BackLink href="/account" label="My account" />
        <h1 className="text-lg font-semibold mb-3">Privacy and your data</h1>
        <QueryState isLoading={isLoading} error={error} isEmpty={false} emptyText="" />
        {data && (
          <>
            <ConsentStatus consents={data} />
            <ConsentHistory history={data.history} />
          </>
        )}
        <DownloadMyData />
        <DataRequestForm />
      </div>
    </div>
  );
}
