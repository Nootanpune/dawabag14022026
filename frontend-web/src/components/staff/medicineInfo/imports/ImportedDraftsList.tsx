'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import QueryState from '@/components/admin/QueryState';
import { formatDateTimeIST } from '@/lib/dates';
import { fetchImportedDrafts, importKeys } from '@/lib/medicineInfo/imports';

/**
 * Sprint 45 — "Imported drafts to check": a registered pharmacist opens each one, checks
 * every line against the pack insert, edits and sends it; a second pharmacist approves (C-19).
 */
export default function ImportedDraftsList({ partnerId, status }: { partnerId: string; status: 'draft' | 'pending_review' }) {
  const { data, isLoading, error } = useQuery({
    queryKey: importKeys.drafts(partnerId, status), queryFn: () => fetchImportedDrafts(partnerId, status),
  });
  return (
    <div>
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length}
        emptyText={status === 'draft' ? 'No imported drafts to check' : 'No imported drafts waiting for approval'} />
      <ul className="space-y-2" data-testid="imported-drafts">
        {data?.map((v) => (
          <li key={v.id} className="card text-sm flex flex-wrap items-start justify-between gap-2" data-testid="imported-draft">
            <div>
              <p className="font-semibold">{v.product_name} <span className="font-normal text-gray-500">· version {v.version}</span></p>
              <p className="text-xs text-gray-600">
                {v.import_partner_name ?? 'Partner removed'} item: {[v.import_meta.item_name, v.import_meta.pack, v.import_meta.company].filter(Boolean).join(' · ')}
              </p>
              <p className="text-xs text-gray-600">
                Assumed composition: {v.import_meta.assumed_composition} (confidence {v.import_meta.composition_confidence})
                {v.flags.length > 0 && <span className="text-red-700"> · {v.flags.length} possible claim{v.flags.length > 1 ? 's' : ''}</span>}
              </p>
              <p className="text-xs text-gray-500">
                Imported {formatDateTimeIST(v.created_at)}
                {v.author_names.length ? ` · checked by ${v.author_names.join(', ')}` : ' · not checked yet'}
                {v.authored_by_you && status === 'pending_review' ? ' · you sent it, another pharmacist approves' : ''}
              </p>
            </div>
            <Link href={`/staff/medicine-info/${v.product_id}`} className="btn-outline text-xs py-1.5 px-3">
              {status === 'draft' ? 'Check and send' : 'Open'}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
