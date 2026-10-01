'use client';
import { useEffect, useState } from 'react';
import { AlarmClock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { formatDuration, type Incident } from '@/lib/compliance/incidents';
import { cn } from '@/lib/utils';
import { formatDateTimeIST } from '@/lib/dates';

/** CERT-In 6-hour reporting clock (C-43): live countdown, overdue, or reported (on time / late). */
export default function CertInBadge({ incident, large }: { incident: Incident; large?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  const pending = !incident.cert_in_reported_at;
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, [pending]);

  const size = large ? 'text-sm px-3 py-1.5' : 'text-xs px-2 py-1';
  if (!pending) {
    return (
      <span
        className={cn('inline-flex items-center gap-1 rounded-lg font-medium', size, incident.cert_in_late ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800')}
        title={incident.cert_in_reference ? `Ref ${incident.cert_in_reference}` : undefined}
      >
        <CheckCircle2 className="w-4 h-4" /> CERT-In reported {incident.cert_in_late ? 'late' : 'on time'} · {formatDateTimeIST(incident.cert_in_reported_at)}
      </span>
    );
  }
  const left = new Date(incident.cert_in_due_at).getTime() - now;
  // The server's flag wins; the local clock only animates the countdown.
  const overdue = incident.cert_in_overdue || left <= 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-lg font-semibold',
        size,
        overdue ? 'bg-red-600 text-white animate-pulse' : left < 2 * 3600000 ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900'
      )}
    >
      {overdue ? <AlertTriangle className="w-4 h-4" /> : <AlarmClock className="w-4 h-4" />}
      {overdue
        ? `CERT-In report OVERDUE by ${formatDuration(left)}`
        : `CERT-In report due in ${formatDuration(left)} (by ${formatDateTimeIST(incident.cert_in_due_at, { zone: true })})`}
    </span>
  );
}
