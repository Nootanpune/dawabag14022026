'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { doctorKeys, fetchDoctorDay, fetchMyProfile } from '@/lib/telemedicine/doctorApi';
import { todayIST } from '@/lib/fulfilment/roles';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import ProfileStatus from '@/components/telemedicine/doctor/ProfileStatus';
import DoctorDayList from '@/components/telemedicine/doctor/DoctorDayList';

// Doctor's consultations for a day (C-22). Join opens 15 minutes before the slot.
export default function DoctorHomePage() {
  const [date, setDate] = useState(todayIST());
  const profile = useQuery({ queryKey: doctorKeys.profile, queryFn: fetchMyProfile });
  const verified = !!profile.data?.is_verified;
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: doctorKeys.day(date),
    queryFn: () => fetchDoctorDay(date),
    enabled: verified,
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Consultations"
        subtitle="Patients booked for the day. Start the call from 15 minutes before the slot."
        onRefresh={verified ? () => refetch() : undefined}
        refreshing={isFetching}
        actions={<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input max-w-[11rem]" />}
      />
      <QueryState isLoading={profile.isLoading} error={profile.error} isEmpty={false} emptyText="" />
      {profile.isSuccess && !verified && <ProfileStatus profile={profile.data} link />}
      {verified && (
        <>
          <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No consultations on this day" />
          {!!data?.length && <DoctorDayList rows={data} date={date} />}
        </>
      )}
    </div>
  );
}
