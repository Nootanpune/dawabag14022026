'use client';
import { categoryLabel, type Incident } from '@/lib/compliance/incidents';
import StatusBadge from '@/components/admin/StatusBadge';
import CertInBadge from './CertInBadge';
import { formatDateTimeIST } from '@/lib/dates';

const SEVERITY_TONE: Record<string, string> = {
  critical: 'bg-red-600 text-white',
  high: 'bg-red-100 text-red-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-gray-100 text-gray-700',
};

function Step({ label, at }: { label: string; at: string | null }) {
  return (
    <span className={at ? 'text-green-700' : 'text-red-700'}>
      {label}: {at ? formatDateTimeIST(at) : 'not yet'}
    </span>
  );
}

/** One incident with its CERT-In clock and notification steps (C-43). */
export default function IncidentCard({ incident: i, onUpdate }: { incident: Incident; onUpdate: (i: Incident) => void }) {
  return (
    <div className={`card ${i.cert_in_overdue ? 'border-red-300' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">
            {i.incident_no} · {i.title}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {categoryLabel(i.category)} · detected {formatDateTimeIST(i.detected_at)}
            {i.reported_by_name ? ` · logged by ${i.reported_by_name}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium uppercase ${SEVERITY_TONE[i.severity] ?? ''}`}>{i.severity}</span>
          <StatusBadge status={i.status === 'contained' ? 'on_hold' : i.status === 'open' ? 'pending' : 'closed'} label={i.status} />
        </div>
      </div>
      <div className="mt-3">
        <CertInBadge incident={i} large={i.status !== 'closed'} />
      </div>
      <p className="text-sm text-gray-700 mt-3 whitespace-pre-wrap line-clamp-3">{i.description}</p>
      {i.personal_data_affected && (
        <p className="text-xs mt-2 flex flex-wrap gap-x-4">
          <span className="font-medium text-gray-700">Personal data affected —</span>
          <Step label="Data Protection Board" at={i.dpb_notified_at} />
          <Step label="Users" at={i.users_notified_at} />
        </p>
      )}
      {i.actions_taken && <p className="text-xs text-gray-600 mt-2 whitespace-pre-wrap">Actions: {i.actions_taken}</p>}
      {i.status !== 'closed' && (
        <div className="flex justify-end mt-3">
          <button onClick={() => onUpdate(i)} className="btn-outline text-xs py-1.5 px-3">
            Record progress
          </button>
        </div>
      )}
    </div>
  );
}
