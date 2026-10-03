'use client';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, ShieldAlert } from 'lucide-react';
import { fetchMyRegistration, practitionerKeys, REGISTRATION_STATUS_LABELS } from '@/lib/practitioner/api';

/**
 * A doctor's / institution's medical council registration as Dawabag staff verified it
 * (Sprint 44; r.65(9)(b)). Shown on the account and at checkout; renders nothing for other buyers.
 */
export default function RegistrationStatusCard({ compact = false }: { compact?: boolean }) {
  const { data } = useQuery({ queryKey: practitionerKeys.me, queryFn: fetchMyRegistration });
  if (!data?.applies) return null;
  const ok = !!data.can_order;
  return (
    <div className={`rounded-lg border p-3 text-sm mb-4 ${ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`} data-testid="registration-status">
      <p className="font-medium flex items-center gap-2">
        {ok ? <BadgeCheck className="w-4 h-4 text-green-700" aria-hidden="true" /> : <ShieldAlert className="w-4 h-4 text-red-700" aria-hidden="true" />}
        Medical council registration: {REGISTRATION_STATUS_LABELS[data.status ?? 'pending'] ?? data.status}
        {data.valid_till ? `, valid till ${data.valid_till}` : ''}
      </p>
      {!compact && (
        <p className="text-xs text-gray-700 mt-1">
          {data.kind === 'institution' ? 'Responsible doctor' : 'Registration'}: {data.registration_number ?? '—'} · {data.council ?? '—'}
          {data.certificate_uploaded ? ' · certificate uploaded' : ' · certificate not uploaded'}
        </p>
      )}
      {!ok && <p className="text-xs text-red-800 mt-1" role="status">{data.message}</p>}
    </div>
  );
}
