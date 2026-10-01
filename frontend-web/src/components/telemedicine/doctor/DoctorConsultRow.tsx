import Link from 'next/link';
import type { ReactNode } from 'react';
import StatusBadge from '@/components/admin/StatusBadge';
import { formatSlotTime, KIND_LABELS, MODE_LABELS, patientLine } from '@/lib/telemedicine/labels';
import type { DoctorConsultation } from '@/lib/telemedicine/types';

/** One booked consultation on the doctor's day list. */
export default function DoctorConsultRow({ c, actions }: { c: DoctorConsultation; actions: ReactNode }) {
  const canPrescribe = ['in_progress', 'completed'].includes(c.status) && !c.prescription_id;
  return (
    <div className="card text-sm flex flex-wrap justify-between gap-3">
      <div className="space-y-1 min-w-0">
        <p className="font-semibold">
          {formatSlotTime(c.slot_start)} – {formatSlotTime(c.slot_end)}
          <span className="font-normal text-gray-500">
            {' '}
            · {MODE_LABELS[c.mode] ?? c.mode} · {KIND_LABELS[c.consult_kind] ?? c.consult_kind}
          </span>
        </p>
        <p>
          {c.patient_name ?? 'Patient'} <span className="text-xs text-gray-500">({patientLine(c.patient_age, c.patient_gender)})</span>
        </p>
        <p className="text-xs text-gray-600">
          <span className="font-medium">Problem:</span> {c.chief_complaint}
        </p>
        <div className="flex gap-1">
          <StatusBadge status={c.status} />
          <StatusBadge status={c.payment_status} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2 items-start justify-end">
        {actions}
        {canPrescribe && (
          <Link href={`/doctor/consultations/${c.id}/prescribe`} className="btn-primary text-xs py-1.5 px-3">
            Write e-prescription
          </Link>
        )}
        {c.prescription_id && (
          <Link href={`/doctor/prescriptions/${c.prescription_id}`} className="btn-outline text-xs py-1.5 px-3">
            View e-prescription
          </Link>
        )}
      </div>
    </div>
  );
}
