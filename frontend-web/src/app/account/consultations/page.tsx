'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { fetchMyConsultations, teleKeys } from '@/lib/telemedicine/api';
import Header from '@/components/layout/Header';
import BackLink from '@/components/admin/BackLink';
import QueryState from '@/components/admin/QueryState';
import MyConsultationsList from '@/components/telemedicine/patient/MyConsultationsList';

// The patient's teleconsultations: pay, join, cancel, e-prescriptions (C-22..C-24)
export default function MyConsultationsPage() {
  const { data, isLoading, error } = useQuery({ queryKey: teleKeys.mine, queryFn: fetchMyConsultations });
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <div>
          <BackLink href="/account" label="My account" />
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-lg font-semibold">My consultations</h1>
            <Link href="/consult" className="btn-primary text-sm">
              Book a doctor
            </Link>
          </div>
          <p className="text-xs text-gray-500">
            You can join 15 minutes before the slot once the fee is paid. Cancel at least 2 hours before for a full refund.
          </p>
        </div>
        <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="You have no consultations yet." />
        {!!data?.length && <MyConsultationsList rows={data} />}
      </div>
    </div>
  );
}
