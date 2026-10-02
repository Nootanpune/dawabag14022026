import type { ReactNode } from 'react';
import { formatDateIST } from '@/lib/dates';
import type { LicenceView } from '@/lib/licences/forms';
import { cn } from '@/lib/utils';

const VALIDITY: Record<LicenceView['validity'], { text: string; tone: string }> = {
  valid: { text: 'valid', tone: 'bg-green-100 text-green-800' },
  expiring: { text: 'renew soon', tone: 'bg-orange-100 text-orange-800' },
  expired: { text: 'expired', tone: 'bg-red-100 text-red-800' },
  no_date: { text: 'valid-till not entered', tone: 'bg-gray-100 text-gray-700' },
};
const STATUS: Partial<Record<LicenceView['status'], { text: string; tone: string }>> = {
  pending: { text: 'waiting for Dawabag’s check', tone: 'bg-amber-100 text-amber-800' },
  rejected: { text: 'not accepted', tone: 'bg-red-100 text-red-800' },
  superseded: { text: 'replaced', tone: 'bg-gray-100 text-gray-600' },
};

export function Pill({ text, tone }: { text: string; tone: string }) {
  return <span className={cn('inline-block rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap', tone)}>{text}</span>;
}

interface Props {
  licences: LicenceView[];
  empty?: string;
  /** Extra controls per licence (open scan, check, …). */
  actions?: (l: LicenceView) => ReactNode;
  compact?: boolean;
  label?: string;
}

/** Every drug licence: form, number, valid till, and a flag when expired or ending within 30 days. */
export default function LicenceList({ licences, empty = 'No drug licence on file', actions, compact, label = 'Drug licences' }: Props) {
  if (!licences.length) return <p className="text-sm text-gray-500">{empty}</p>;
  return (
    <ul className={cn('divide-y divide-gray-100', compact ? 'text-xs' : 'text-sm')} aria-label={label}>
      {licences.map((l, i) => {
        const v = VALIDITY[l.validity];
        const s = STATUS[l.status];
        return (
          <li key={l.id ?? `${l.form}-${i}`} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="licence-item">
            <span className="font-medium text-gray-900 min-w-[5.5rem]">{l.label}</span>
            <span className="font-mono break-all">{l.licence_number}</span>
            <span className="text-gray-600">{l.valid_upto ? `valid till ${formatDateIST(l.valid_upto)}` : ''}</span>
            {l.status !== 'superseded' && l.status !== 'rejected' && <Pill {...v} />}
            {s && <Pill {...s} />}
            {l.issued_by && !compact && <span className="text-xs text-gray-500">issued by {l.issued_by}</span>}
            {l.status === 'rejected' && l.rejection_reason && <span className="w-full text-xs text-red-700">Reason: {l.rejection_reason}</span>}
            {actions && <span className="ml-auto flex gap-2">{actions(l)}</span>}
          </li>
        );
      })}
    </ul>
  );
}
