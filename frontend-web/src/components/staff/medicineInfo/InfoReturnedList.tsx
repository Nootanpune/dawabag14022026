'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import QueryState from '@/components/admin/QueryState';
import { formatDateTimeIST } from '@/lib/dates';
import { fetchInfoReturned, medicineInfoKeys } from '@/lib/medicineInfo/api';

/** Sprint 36 — versions a second pharmacist sent back to me, with the reason (C-19). */
export default function InfoReturnedList() {
  const { data, isLoading, error } = useQuery({ queryKey: medicineInfoKeys.returned, queryFn: fetchInfoReturned });
  return (
    <section className="mt-6" aria-labelledby="info-returned-heading">
      <h2 id="info-returned-heading" className="text-lg font-semibold text-gray-900">Returned to you</h2>
      <p className="text-sm text-gray-500 mb-3">Text you wrote that another pharmacist did not approve. Fix it in the editor and send it again.</p>
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="Nothing returned to you" />
      {!!data?.length && (
        <ul className="card p-0 divide-y divide-gray-100" data-testid="info-returned">
          {data.map((v) => (
            <li key={v.id} className="px-4 py-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <p className="font-medium">{v.product_name} <span className="font-normal text-gray-500">· version {v.version}</span></p>
                <Link href={`/staff/medicine-info/${v.product_id}`} className="text-xs text-brand-700 underline">Fix in the editor</Link>
              </div>
              <p className="text-gray-800 mt-1"><span className="font-medium">Reason:</span> {v.review_notes}</p>
              <p className="text-xs text-gray-500">
                {v.reviewed_by_name ?? 'A pharmacist'}{v.reviewed_at ? `, ${formatDateTimeIST(v.reviewed_at)}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
