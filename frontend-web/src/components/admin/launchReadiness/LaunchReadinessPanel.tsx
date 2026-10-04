'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import { fetchLaunchReadiness, launchReadinessKey, readyText, type ReadinessItem } from '@/lib/admin/launchReadiness';
import { formatDateTimeIST } from '@/lib/dates';
import ReadinessSectionCard from './ReadinessSectionCard';
import ManualItemDialog from './ManualItemDialog';

/**
 * Launch readiness (Sprint 49): everything to do before real customers, as the server sees
 * it now — the live version of docs/LAUNCH_CHECKLIST.md. Computed items come from the
 * database and the server's configuration; jobs the software cannot see (lawyer, CA, DLT,
 * restore drill …) are kept by admins here, each change audited.
 */
export default function LaunchReadinessPanel() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({ queryKey: launchReadinessKey, queryFn: fetchLaunchReadiness });
  const [editing, setEditing] = useState<ReadinessItem | null>(null);
  const [openOnly, setOpenOnly] = useState(false);
  const shown = (items: ReadinessItem[]) => (openOnly ? items.filter((i) => i.status === 'in_progress' || i.status === 'not_started') : items);

  return (
    <div>
      <PageHeader title="Launch readiness" onRefresh={() => refetch()} refreshing={isFetching}
        subtitle="Everything to do before the first real order, checked by the server now. Items marked “Recorded by an admin” are updated here by hand." />
      <QueryState isLoading={isLoading} error={error} isEmpty={false} emptyText="" />
      {data && (
        <>
          <div className="card mb-5 flex flex-wrap items-center justify-between gap-3" data-testid="readiness-summary">
            <div>
              <p className="text-2xl font-bold text-gray-900">{readyText(data.summary)}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {data.summary.in_progress} in progress · {data.summary.not_started} not started
                {data.summary.not_applicable > 0 && <> · {data.summary.not_applicable} not applicable here</>}
                {' '}· server: {data.app_env} · checked {formatDateTimeIST(data.checked_at)}
              </p>
            </div>
            <label className="text-sm text-gray-700 inline-flex items-center gap-2">
              <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
              Show only what is still to do
            </label>
          </div>
          {data.sections.map((s) => <ReadinessSectionCard key={s.section} section={s} items={shown(s.items)} onEdit={setEditing} />)}
        </>
      )}
      {editing && <ManualItemDialog item={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
