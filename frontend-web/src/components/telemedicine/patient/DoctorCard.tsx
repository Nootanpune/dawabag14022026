import Link from 'next/link';
import { Stethoscope } from 'lucide-react';
import { formatPaise } from '@/lib/admin/format';
import type { Doctor } from '@/lib/telemedicine/types';
import DoctorRegistration from '../common/DoctorRegistration';

/** One verified doctor with registration and fee (C-22). `showBook` hides the Book link on the booking page. */
export default function DoctorCard({ d, showBook = true }: { d: Doctor; showBook?: boolean }) {
  return (
    <div className="card text-sm flex flex-wrap gap-4 justify-between">
      <div className="flex gap-3 min-w-0">
        <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center shrink-0">
          <Stethoscope className="w-5 h-5 text-brand-600" />
        </div>
        <div className="min-w-0 space-y-1">
          <p className="font-semibold">Dr {d.full_name}</p>
          <p className="text-xs text-gray-500">
            {[d.speciality, d.clinic_name].filter(Boolean).join(' · ') || 'General practice'}
          </p>
          <DoctorRegistration qualification={d.qualification} council={d.council} regNo={d.nmc_reg_number} year={d.registration_year} />
          {!!d.languages_spoken?.length && <p className="text-xs text-gray-500">Speaks {d.languages_spoken.join(', ')}</p>}
          {d.bio && <p className="text-xs text-gray-600 whitespace-pre-wrap">{d.bio}</p>}
        </div>
      </div>
      <div className="text-right space-y-2">
        <p className="text-xs text-gray-500">Consultation fee</p>
        <p className="font-semibold text-brand-700">{d.consultation_fee_paise ? formatPaise(d.consultation_fee_paise) : 'Free'}</p>
        {showBook && (
          <Link href={`/consult/${d.id}`} className="btn-primary text-sm inline-block">
            Book
          </Link>
        )}
      </div>
    </div>
  );
}
