import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import type { DoctorProfile } from '@/lib/telemedicine/types';
import { formatDateTimeIST } from '@/lib/dates';

/** Where the doctor's registration check stands (C-22). `link` points to the profile page. */
export default function ProfileStatus({ profile, link }: { profile: DoctorProfile | null; link?: boolean }) {
  const go = link && (
    <Link href="/doctor/profile" className="underline font-medium ml-1">
      Open profile
    </Link>
  );
  if (!profile) {
    return (
      <p className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <span>Complete your profile and council registration first. An admin checks it before you can take consultations.{go}</span>
      </p>
    );
  }
  if (profile.is_verified) {
    return (
      <p className="flex items-start gap-2 text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg p-3">
        <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
        <span>Registration verified{profile.verified_at ? ` on ${formatDateTimeIST(profile.verified_at)}` : ''}. You are listed for patients.</span>
      </p>
    );
  }
  if (profile.rejection_reason) {
    return (
      <p className="flex items-start gap-2 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg p-3">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          Registration not accepted: {profile.rejection_reason}. Correct the details and save to send it for checking again.{go}
        </span>
      </p>
    );
  }
  return (
    <p className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
      <Clock className="w-4 h-4 mt-0.5 shrink-0" />
      <span>An admin is checking your registration with the council register. You can add slots once it is verified.{go}</span>
    </p>
  );
}
