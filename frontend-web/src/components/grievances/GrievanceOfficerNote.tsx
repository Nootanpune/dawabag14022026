'use client';
import { useLegalInfo } from '@/components/legal/useLegalInfo';

/** Grievance officer and redressal timelines from the server (C-36). */
export default function GrievanceOfficerNote() {
  const { data } = useLegalInfo();
  if (!data) return null;
  const p = data.grievance_policy;
  const o = data.grievance_officer;
  return (
    <div className="text-xs text-gray-600 bg-white border border-gray-200 rounded-lg p-3 mb-4">
      We acknowledge every complaint within {p.acknowledge_within_hours} hours and aim to resolve it within {p.resolve_within_days} days.
      {o && (
        <span className="block mt-1">
          Grievance officer: {o.name} · {o.email} · {o.phone}
        </span>
      )}
    </div>
  );
}
