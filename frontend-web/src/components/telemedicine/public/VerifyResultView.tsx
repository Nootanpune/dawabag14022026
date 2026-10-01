import { CheckCircle2, XCircle } from 'lucide-react';
import { MODE_LABELS, patientLine } from '@/lib/telemedicine/labels';
import type { VerifyResult } from '@/lib/telemedicine/types';
import DoctorRegistration from '../common/DoctorRegistration';
import MedicineItemsTable from '../common/MedicineItemsTable';
import { formatDateIST, formatDateTimeIST } from '@/lib/dates';

/** What a pharmacist needs to match a paper or PDF e-prescription (C-24): validity, doctor, patient initials, medicines. */
export default function VerifyResultView({ code, r }: { code: string; r: VerifyResult }) {
  return (
    <div className="space-y-4">
      <div
        className={`rounded-xl border p-5 flex items-center gap-3 ${
          r.valid ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'
        }`}
      >
        {r.valid ? <CheckCircle2 className="w-8 h-8 shrink-0" /> : <XCircle className="w-8 h-8 shrink-0" />}
        <div>
          <p className="text-xl font-bold">{r.valid ? 'Valid e-prescription' : 'Expired e-prescription'}</p>
          <p className="text-sm">
            Code <span className="font-mono font-semibold">{code.toUpperCase()}</span> · issued {formatDateTimeIST(r.issued_at)} ·{' '}
            {r.valid ? 'valid until' : 'expired after'} {formatDateIST(r.valid_until)}
          </p>
        </div>
      </div>
      <div className="card text-sm grid sm:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-semibold text-gray-500">Doctor</p>
          <p className="font-medium">Dr {r.doctor.name}</p>
          <DoctorRegistration qualification={r.doctor.qualification} council={r.doctor.council} regNo={r.doctor.registration_no} />
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-500">Patient</p>
          <p className="font-medium">{r.patient.initials || '—'}</p>
          <p className="text-xs text-gray-500">{patientLine(r.patient.age, r.patient.gender)}</p>
          <p className="text-xs text-gray-500 mt-1">Teleconsultation by {MODE_LABELS[r.consult_mode] ?? r.consult_mode}</p>
        </div>
      </div>
      <div className="card">
        <p className="text-xs font-semibold text-gray-500 mb-1">Medicines</p>
        <MedicineItemsTable items={r.items} />
      </div>
    </div>
  );
}
