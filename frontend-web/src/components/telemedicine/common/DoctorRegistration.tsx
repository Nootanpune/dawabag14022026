import { BadgeCheck } from 'lucide-react';

interface Props {
  qualification: string;
  council: string;
  regNo: string;
  year?: number | null;
}

/** Qualification and council registration, shown wherever a doctor is named (C-22). */
export default function DoctorRegistration({ qualification, council, regNo, year }: Props) {
  return (
    <div className="text-xs text-gray-600 space-y-0.5">
      <p>{qualification}</p>
      <p className="flex items-center gap-1">
        <BadgeCheck className="w-3.5 h-3.5 text-brand-600 shrink-0" />
        {council} · Reg. no. <span className="font-medium text-gray-800">{regNo}</span>
        {year ? ` (${year})` : ''}
      </p>
    </div>
  );
}
