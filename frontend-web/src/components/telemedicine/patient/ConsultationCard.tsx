import Link from 'next/link';
import type { ReactNode } from 'react';
import StatusBadge from '@/components/admin/StatusBadge';
import { formatPaise } from '@/lib/admin/format';
import { KIND_LABELS, MODE_LABELS, paymentStatusLabel } from '@/lib/telemedicine/labels';
import type { MyConsultation } from '@/lib/telemedicine/types';
import DoctorRegistration from '../common/DoctorRegistration';
import { formatClockTime, formatDateIST } from '@/lib/dates';

/** One of the patient's consultations; actions come from the page. */
export default function ConsultationCard({ c, actions }: { c: MyConsultation; actions?: ReactNode }) {
  return (
    <div className="card text-sm space-y-3">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <p className="font-semibold">Dr {c.doctor_name}</p>
          {c.speciality && <p className="text-xs text-gray-500">{c.speciality}</p>}
          <DoctorRegistration qualification={c.qualification} council={c.council} regNo={c.nmc_reg_number} />
        </div>
        <div className="text-right space-y-1">
          <p className="font-medium">
            {formatDateIST(c.slot_date)}, {formatClockTime(c.slot_start, { zone: true })}
          </p>
          <p className="text-xs text-gray-500">
            {MODE_LABELS[c.mode] ?? c.mode} · {KIND_LABELS[c.consult_kind] ?? c.consult_kind}
          </p>
          <div className="flex gap-1 justify-end">
            <StatusBadge status={c.status} />
            <StatusBadge
              status={c.payment_status}
              label={`${paymentStatusLabel(c.payment_status)} ${c.fee_paise ? formatPaise(c.fee_paise) : ''}`.trim()}
            />
          </div>
        </div>
      </div>
      <p className="text-xs text-gray-600">
        <span className="font-medium">Problem:</span> {c.chief_complaint}
      </p>
      <div className="flex flex-wrap gap-2 justify-end">
        {actions}
        {c.prescription_id && (
          <Link href={`/account/consultations/prescriptions/${c.prescription_id}`} className="btn-primary text-xs py-1.5 px-3">
            View e-prescription
          </Link>
        )}
      </div>
    </div>
  );
}
