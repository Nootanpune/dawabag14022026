'use client';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchPolicy, isPolicyKey, POLICY_LABELS, policyKeys } from '@/lib/legal/policies';
import { formatDateIST } from '@/lib/admin/format';
import Header from '@/components/layout/Header';
import QueryState from '@/components/admin/QueryState';
import PolicyBody from '@/components/legal/PolicyBody';

// Public policy page, from the server (C-39). ?version=n shows an older version.
export default function PolicyPage() {
  const { key } = useParams<{ key: string }>();
  const version = Number(useSearchParams()?.get('version')) || undefined;
  const valid = isPolicyKey(key);
  const { data, isLoading, error } = useQuery({
    queryKey: policyKeys.one(key, version),
    queryFn: () => fetchPolicy(key as never, version),
    enabled: valid,
    retry: false,
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-3xl mx-auto px-4 py-6">
        <Link href="/policies" className="text-sm text-gray-500 hover:text-brand-600">
          ← All policies
        </Link>
        {!valid ? (
          <p className="card mt-3 text-sm text-gray-500">This policy does not exist.</p>
        ) : (
          <>
            <QueryState isLoading={isLoading} error={error} isEmpty={false} emptyText="" />
            {data && (
              <article className="card mt-3">
                <h1 className="text-xl font-semibold">{data.title || POLICY_LABELS[key]}</h1>
                <p className="text-xs text-gray-500 mb-4">
                  Version {data.version} · effective from {formatDateIST(data.effective_from)}
                </p>
                <PolicyBody body={data.body} />
              </article>
            )}
          </>
        )}
      </div>
    </div>
  );
}
