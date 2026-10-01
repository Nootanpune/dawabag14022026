'use client';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchEPrescription, teleKeys } from '@/lib/telemedicine/api';
import Header from '@/components/layout/Header';
import BackLink from '@/components/admin/BackLink';
import QueryState from '@/components/admin/QueryState';
import EPrescriptionView from '@/components/telemedicine/common/EPrescriptionView';
import PrescriptionActions from '@/components/telemedicine/patient/PrescriptionActions';

// E-prescription from a teleconsultation (C-24). Every view is logged on the server (C-41).
export default function MyEPrescriptionPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({ queryKey: teleKeys.prescription(id), queryFn: () => fetchEPrescription(id) });
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <BackLink href="/account/consultations" label="My consultations" />
        <h1 className="text-lg font-semibold">E-prescription</h1>
        <QueryState isLoading={isLoading} error={error} isEmpty={!data} emptyText="Prescription not found" />
        {data && (
          <>
            <EPrescriptionView rx={data} />
            <PrescriptionActions rx={data} />
          </>
        )}
      </div>
    </div>
  );
}
