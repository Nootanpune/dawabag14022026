'use client';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { teleKeys, verifyEPrescription } from '@/lib/telemedicine/api';
import Header from '@/components/layout/Header';
import QueryState from '@/components/admin/QueryState';
import VerifyResultView from '@/components/telemedicine/public/VerifyResultView';
import VerifyCodeForm from '@/components/telemedicine/public/VerifyCodeForm';

// Public check of an e-prescription by code (C-24). No login; only initials of the patient are shown.
export default function VerifyCodePage() {
  const { code } = useParams<{ code: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: teleKeys.verify(code),
    queryFn: () => verifyEPrescription(code),
    retry: false,
  });
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <h1 className="text-lg font-semibold">E-prescription check</h1>
        <QueryState isLoading={isLoading} error={error} isEmpty={!data} emptyText="No e-prescription with that code" />
        {data && <VerifyResultView code={code} r={data} />}
        <div className="pt-2">
          <p className="text-xs text-gray-500 mb-1">Check another code</p>
          <VerifyCodeForm />
        </div>
      </div>
    </div>
  );
}
