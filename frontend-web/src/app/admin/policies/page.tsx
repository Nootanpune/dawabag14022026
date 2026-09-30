'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchPolicyHistory, POLICY_KEYS, POLICY_LABELS, policyKeys, type PolicyKey } from '@/lib/legal/policies';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import StatusTabs from '@/components/admin/StatusTabs';
import PolicyEditor from '@/components/admin/policies/PolicyEditor';
import PolicyHistory from '@/components/admin/policies/PolicyHistory';

const TABS = POLICY_KEYS.map((k) => ({ value: k, label: POLICY_LABELS[k] }));

// Versioned website policies (C-39)
export default function AdminPoliciesPage() {
  const [key, setKey] = useState<PolicyKey>('terms');
  const history = useQuery({ queryKey: policyKeys.history(key), queryFn: () => fetchPolicyHistory(key) });
  return (
    <div>
      <PageHeader
        title="Policies"
        subtitle="Terms, privacy, shipping, cancellation and refund policies shown on the website and at checkout"
        onRefresh={() => history.refetch()}
        refreshing={history.isFetching}
      />
      <StatusTabs tabs={TABS} value={key} onChange={setKey} />
      <div className="space-y-4">
        <QueryState isLoading={history.isLoading} error={history.error} isEmpty={false} emptyText="" />
        {history.data && (
          <>
            <PolicyEditor key={`${key}-${history.data[0]?.version ?? 0}`} docKey={key} latestVersion={history.data[0]?.version} />
            <div>
              <h2 className="font-semibold text-sm mb-2">Version history</h2>
              <PolicyHistory docKey={key} versions={history.data} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
