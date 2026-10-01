'use client';
import { useQuery } from '@tanstack/react-query';
import { fetchMyDataRequests, privacyKeys } from '@/lib/privacy/api';
import QueryState from '@/components/admin/QueryState';
import StatusBadge from '@/components/admin/StatusBadge';
import { formatDateTimeIST } from '@/lib/dates';

/** The user's own correction / erasure requests and what was done (C-43, C-44). */
export default function MyDataRequests() {
  const { data, isLoading, error } = useQuery({ queryKey: privacyKeys.myRequests, queryFn: fetchMyDataRequests });
  return (
    <div className="card mt-4">
      <h2 className="font-semibold text-sm mb-2">Your requests</h2>
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="You have not made any requests." />
      <ul className="divide-y divide-gray-100 text-sm">
        {data?.map((r) => (
          <li key={r.id} className="py-2">
            <div className="flex justify-between gap-2">
              <span className="font-medium">{r.request_type === 'erasure' ? 'Erase my account' : 'Correct my data'}</span>
              <StatusBadge status={r.status} />
            </div>
            <p className="text-xs text-gray-500">
              Sent {formatDateTimeIST(r.created_at)}
              {r.handled_at ? ` · handled ${formatDateTimeIST(r.handled_at)}` : ''}
            </p>
            {r.details && <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{r.details}</p>}
            {r.outcome && <p className="text-xs text-gray-800 mt-1 bg-gray-50 rounded p-2 whitespace-pre-wrap">{r.outcome}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
