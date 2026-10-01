import { KIND_LABELS, MODE_LABELS, patientLine } from '@/lib/telemedicine/labels';
import type { EPrescription } from '@/lib/telemedicine/types';
import DoctorRegistration from './DoctorRegistration';
import MedicineItemsTable from './MedicineItemsTable';
import { formatDateIST, formatDateTimeIST, isOnOrAfterTodayIST } from '@/lib/dates';

/** E-prescription as issued: frozen doctor and patient details, diagnosis and medicines (C-24). */
export default function EPrescriptionView({ rx }: { rx: EPrescription }) {
  const expired = !isOnOrAfterTodayIST(rx.valid_until);
  return (
    <div className="card space-y-4 text-sm">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <p className="font-semibold">Dr {rx.doctor_name}</p>
          <DoctorRegistration qualification={rx.doctor_qualification} council={rx.doctor_council} regNo={rx.doctor_reg_no} />
        </div>
        <div className="text-right text-xs text-gray-600">
          <p>Issued {formatDateTimeIST(rx.issued_at)}</p>
          <p className={expired ? 'text-red-600 font-medium' : ''}>
            {expired ? 'Expired' : 'Valid until'} {formatDateIST(rx.valid_until)}
          </p>
          <p>
            {MODE_LABELS[rx.consult_mode] ?? rx.consult_mode} · {KIND_LABELS[rx.consult_kind] ?? rx.consult_kind}
          </p>
          <p className="mt-1">
            Check code <span className="font-mono font-semibold text-gray-900">{rx.verification_code}</span>
          </p>
        </div>
      </div>
      <div className="border-t border-gray-100 pt-3 grid sm:grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-semibold text-gray-500">Patient</p>
          <p>{rx.patient_name ?? '—'}</p>
          <p className="text-xs text-gray-500">{patientLine(rx.patient_age, rx.patient_gender)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-500">Diagnosis</p>
          <p className="whitespace-pre-wrap">{rx.diagnosis}</p>
        </div>
      </div>
      <MedicineItemsTable items={rx.items} />
      {rx.advice && (
        <div>
          <p className="text-xs font-semibold text-gray-500">Advice</p>
          <p className="whitespace-pre-wrap">{rx.advice}</p>
        </div>
      )}
    </div>
  );
}
