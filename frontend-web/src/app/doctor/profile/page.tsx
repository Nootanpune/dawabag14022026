'use client';
import { useQuery } from '@tanstack/react-query';
import { doctorKeys, fetchMyProfile } from '@/lib/telemedicine/doctorApi';
import { EMPTY_PROFILE, formFromProfile } from '@/lib/telemedicine/profileForm';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import ProfileStatus from '@/components/telemedicine/doctor/ProfileStatus';
import DoctorProfileForm from '@/components/telemedicine/doctor/DoctorProfileForm';

// Doctor's registration details, checked by an admin against the council register (C-22)
export default function DoctorProfilePage() {
  const { data, isLoading, error, isSuccess, dataUpdatedAt } = useQuery({ queryKey: doctorKeys.profile, queryFn: fetchMyProfile });
  return (
    <div className="space-y-4">
      <PageHeader
        title="Profile and registration"
        subtitle="Patients see your qualification, council and registration number. They are printed on every e-prescription."
      />
      <QueryState isLoading={isLoading} error={error} isEmpty={false} emptyText="" />
      {isSuccess && (
        <>
          <ProfileStatus profile={data} />
          {/* remount with the server's values after each save */}
          <DoctorProfileForm key={dataUpdatedAt} initial={data ? formFromProfile(data) : EMPTY_PROFILE} />
        </>
      )}
    </div>
  );
}
