'use client';
import Link from 'next/link';
import { ArrowRight, Pencil } from 'lucide-react';
import type { ReadinessItem } from '@/lib/admin/launchReadiness';
import { formatDateTimeIST } from '@/lib/dates';
import ReadinessStatusBadge from './ReadinessStatusBadge';

/**
 * One checklist item: what has to be done, who does it, its status and the evidence the
 * server found (counts and settings — a secret only as "set" / "not set"). Manual items
 * show the admin's note and can be changed; computed items change by doing the job.
 */
export default function ReadinessItemCard({ item, onEdit }: { item: ReadinessItem; onEdit?: (item: ReadinessItem) => void }) {
  return (
    <li className="px-4 py-3" data-testid={`readiness-item-${item.key}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm text-gray-900 flex-1 min-w-[12rem]">
          <span className="font-semibold text-gray-500 mr-1.5">{item.ref}</span>{item.title}
        </p>
        <ReadinessStatusBadge status={item.status} label={item.status_label} />
      </div>
      <p className="text-xs text-gray-500 mt-1">
        Who: {item.who} · {item.kind === 'computed' ? 'Checked by the server' : 'Recorded by an admin'}
      </p>
      {!!item.evidence.length && (
        <ul className="mt-1.5 text-xs text-gray-700 list-disc pl-5 space-y-0.5" aria-label="Evidence">
          {item.evidence.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}
      {item.kind === 'manual' && (
        <p className="mt-1.5 text-xs text-gray-700">
          {item.note ? <>Note: {item.note}</> : <span className="text-gray-400">No note</span>}
          {item.updated_at && <span className="text-gray-500"> — {item.updated_by_name ?? 'unknown'}, {formatDateTimeIST(item.updated_at)}</span>}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-3">
        {item.link && (
          <Link href={item.link.href} className="text-xs font-medium text-brand-700 hover:underline inline-flex items-center gap-1">
            {item.link.label} <ArrowRight className="w-3 h-3" aria-hidden="true" />
          </Link>
        )}
        {item.kind === 'manual' && onEdit && (
          <button type="button" onClick={() => onEdit(item)} className="text-xs font-medium text-gray-700 hover:underline inline-flex items-center gap-1"
            aria-label={`Update ${item.ref}`}>
            <Pencil className="w-3 h-3" aria-hidden="true" /> Update
          </button>
        )}
      </div>
    </li>
  );
}
