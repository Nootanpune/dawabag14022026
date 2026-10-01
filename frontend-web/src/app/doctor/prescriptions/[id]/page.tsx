'use client';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchEPrescription, teleKeys } from '@/lib/telemedicine/api';
import BackLink from '@/components/admin/BackLink';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import EPrescriptionView from '@/components/telemedicine/common/EPrescriptionView';
import EPrescriptionPdfButton from '@/components/telemedicine/common/EPrescriptionPdfButton';

// An e-prescription the doctor issued; final once issued (C-24)
export default function DoctorEPrescriptionPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({ queryKey: teleKeys.prescription(id), queryFn: () => fetchEPrescription(id) });
  return (
    <div className="space-y-4">
      <BackLink href="/doctor" label="Consultations" />
      <PageHeader title="E-prescription" subtitle="Issued prescriptions cannot be changed." actions={data && <EPrescriptionPdfButton id={data.id} />} />
      <QueryState isLoading={isLoading} error={error} isEmpty={!data} emptyText="Prescription not found" />
      {data && <EPrescriptionView rx={data} />}
    </div>
  );
}
