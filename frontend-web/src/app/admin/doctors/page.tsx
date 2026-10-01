'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminDoctorKeys, fetchAdminDoctors } from '@/lib/telemedicine/adminApi';
import { REVIEW_TABS } from '@/lib/telemedicine/labels';
import { DOCTOR_ADMIN_ROLES } from '@/lib/telemedicine/roles';
import type { AdminDoctor, DoctorReviewStatus } from '@/lib/telemedicine/types';
import RequireAuth from '@/components/auth/RequireAuth';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import StatusTabs from '@/components/admin/StatusTabs';
import EnableDoctorForm from '@/components/telemedicine/admin/EnableDoctorForm';
import AdminDoctorTable from '@/components/telemedicine/admin/AdminDoctorTable';
import VerifyDoctorDialog from '@/components/telemedicine/admin/VerifyDoctorDialog';

// Teleconsultation doctors: check each registration against the NMC / state council register before listing (C-22)
function DoctorsScreen() {
  const [status, setStatus] = useState<DoctorReviewStatus | ''>('pending');
  const [deciding, setDeciding] = useState<{ d: AdminDoctor; approve: boolean } | null>(null);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: adminDoctorKeys.list(status),
    queryFn: () => fetchAdminDoctors(status),
  });
  return (
    <div>
      <PageHeader
        title="Doctors"
        subtitle="Search the council's register for the name and number before verifying. Only verified doctors are listed and can prescribe."
        onRefresh={() => refetch()}
        refreshing={isFetching}
      />
      <EnableDoctorForm />
      <StatusTabs tabs={REVIEW_TABS} value={status} onChange={setStatus} />
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No doctors" />
      {!!data?.length && <AdminDoctorTable rows={data} onDecide={(d, approve) => setDeciding({ d, approve })} />}
      {deciding && <VerifyDoctorDialog d={deciding.d} approve={deciding.approve} onClose={() => setDeciding(null)} />}
    </div>
  );
}

export default function AdminDoctorsPage() {
  return (
    <RequireAuth roles={DOCTOR_ADMIN_ROLES}>
      <DoctorsScreen />
    </RequireAuth>
  );
}
