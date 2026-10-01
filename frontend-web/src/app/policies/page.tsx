'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { fetchPolicies, LANGUAGE_LABELS, POLICY_KEYS, POLICY_LABELS, policyKeys } from '@/lib/legal/policies';
import { formatDateIST } from '@/lib/admin/format';
import Header from '@/components/layout/Header';
import QueryState from '@/components/admin/QueryState';

// Index of published policies (C-39)
export default function PoliciesIndexPage() {
  const { data, isLoading, error } = useQuery({ queryKey: policyKeys.list, queryFn: fetchPolicies });
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="text-lg font-semibold mb-3">Policies</h1>
        <QueryState isLoading={isLoading} error={error} isEmpty={false} emptyText="" />
        {data && (
          <div className="card p-0 divide-y divide-gray-100">
            {POLICY_KEYS.map((k) => {
              const p = data.find((x) => x.doc_key === k);
              return (
                <div key={k} className="px-4 py-3 text-sm flex justify-between gap-3">
                  {p ? (
                    <span>
                      <Link href={`/policies/${k}`} className="text-brand-700 hover:underline">
                        {p.title}
                      </Link>
                      {(p.languages ?? [])
                        .filter((l) => l !== 'en')
                        .map((l) => (
                          <Link key={l} href={`/policies/${k}?lang=${l}`} lang={l} className="ml-2 text-xs text-brand-700 hover:underline">
                            {LANGUAGE_LABELS[l]}
                          </Link>
                        ))}
                    </span>
                  ) : (
                    <span className="text-gray-400">{POLICY_LABELS[k]} — not yet published</span>
                  )}
                  {p && <span className="text-xs text-gray-400">v{p.version} · from {formatDateIST(p.effective_from)}</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
