'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { fetchImportedCounts, importKeys } from '@/lib/medicineInfo/imports';

/** Sprint 45 — imported drafts per partner: to check (draft) and waiting for the second pharmacist. */
export default function ImportedDraftCounts() {
  const { data } = useQuery({ queryKey: importKeys.counts, queryFn: fetchImportedCounts });
  if (!data?.length) return null;
  return (
    <section className="card text-sm" aria-labelledby="imported-counts-heading" data-testid="imported-draft-counts">
      <h2 id="imported-counts-heading" className="font-semibold text-gray-900">Imported drafts</h2>
      <ul className="mt-2 space-y-1">
        {data.map((c) => (
          <li key={c.partner_id ?? 'none'} className="flex flex-wrap gap-x-3">
            <span className="font-medium">{c.partner_name ?? 'Partner removed'}:</span>
            <Link className="text-brand-700 underline" href={`/staff/medicine-info-imported${c.partner_id ? `?partner=${c.partner_id}` : ''}`}>
              {c.to_check} to check
            </Link>
            <span className="text-gray-600">{c.waiting_approval} waiting for approval</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
