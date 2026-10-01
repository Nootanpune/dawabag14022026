'use client';
import { useParams, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { doctorKeys, fetchDoctorDay } from '@/lib/telemedicine/doctorApi';
import { formatSlotDate, formatSlotTime, KIND_LABELS, MODE_LABELS, patientLine } from '@/lib/telemedicine/labels';
import { todayIST } from '@/lib/fulfilment/roles';
import BackLink from '@/components/admin/BackLink';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import PrescribeForm from '@/components/telemedicine/doctor/PrescribeForm';

// Write the e-prescription for a consultation (C-23, C-24). The consultation is read from the day list on the server.
export default function PrescribePage() {
  const { id } = useParams<{ id: string }>();
  const date = useSearchParams()?.get('date') || todayIST();
  const { data, isLoading, error } = useQuery({ queryKey: doctorKeys.day(date), queryFn: () => fetchDoctorDay(date) });
  const c = data?.find((x) => x.id === id);
  return (
    <div className="space-y-4">
      <BackLink href="/doctor" label="Consultations" />
      <QueryState isLoading={isLoading} error={error} isEmpty={!c} emptyText="Consultation not found on this day" />
      {c && (
        <>
          <PageHeader
            title={`E-prescription for ${c.patient_name ?? 'patient'}`}
            subtitle={`${patientLine(c.patient_age, c.patient_gender)} · ${formatSlotDate(c.slot_date)} ${formatSlotTime(c.slot_start)} · ${
              MODE_LABELS[c.mode] ?? c.mode
            } · ${KIND_LABELS[c.consult_kind] ?? c.consult_kind}`}
          />
          <p className="text-sm text-gray-600">
            <span className="font-medium">Problem:</span> {c.chief_complaint}
          </p>
          {c.prescription_id ? (
            <p className="text-sm text-gray-600">An e-prescription was already issued for this consultation.</p>
          ) : !['in_progress', 'completed'].includes(c.status) ? (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
              Start the consultation first; a prescription is written during or after it.
            </p>
          ) : (
            <PrescribeForm c={c} />
          )}
        </>
      )}
    </div>
  );
}
