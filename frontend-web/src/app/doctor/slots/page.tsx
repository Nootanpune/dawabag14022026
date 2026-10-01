'use client';
import { useQuery } from '@tanstack/react-query';
import { doctorKeys, fetchMyProfile } from '@/lib/telemedicine/doctorApi';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import ProfileStatus from '@/components/telemedicine/doctor/ProfileStatus';
import AddSlotsForm from '@/components/telemedicine/doctor/AddSlotsForm';
import MySlotsList from '@/components/telemedicine/doctor/MySlotsList';

// Slots are offered only once the registration is verified (C-22; the server answers 403 before that)
export default function DoctorSlotsPage() {
  const { data, isLoading, error, isSuccess } = useQuery({ queryKey: doctorKeys.profile, queryFn: fetchMyProfile });
  return (
    <div className="space-y-4">
      <PageHeader title="Slots" subtitle="Times patients can book. Each slot is one consultation." />
      <QueryState isLoading={isLoading} error={error} isEmpty={false} emptyText="" />
      {isSuccess && !data?.is_verified && <ProfileStatus profile={data} link />}
      {data?.is_verified && (
        <>
          <AddSlotsForm />
          <MySlotsList />
        </>
      )}
    </div>
  );
}
