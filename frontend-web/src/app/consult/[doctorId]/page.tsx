'use client';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchDoctor, teleKeys } from '@/lib/telemedicine/api';
import Header from '@/components/layout/Header';
import BackLink from '@/components/admin/BackLink';
import QueryState from '@/components/admin/QueryState';
import DoctorCard from '@/components/telemedicine/patient/DoctorCard';
import BookingForm from '@/components/telemedicine/patient/BookingForm';

// Book a teleconsultation slot (TPG 2020; C-22, C-23)
export default function BookDoctorPage() {
  const { doctorId } = useParams<{ doctorId: string }>();
  const { data, isLoading, error } = useQuery({ queryKey: teleKeys.doctor(doctorId), queryFn: () => fetchDoctor(doctorId) });
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <BackLink href="/consult" label="All doctors" />
        <QueryState isLoading={isLoading} error={error} isEmpty={!data} emptyText="Doctor not found" />
        {data && (
          <>
            <DoctorCard d={data} showBook={false} />
            <BookingForm doctor={data} />
          </>
        )}
      </div>
    </div>
  );
}
