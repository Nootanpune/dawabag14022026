'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { approveCount, fetchCount, saveCountLines, stockControlKeys, submitCount } from '@/lib/stock/api';
import { useAuthStore } from '@/store/authStore';
import { hasRole } from '@/lib/admin/roles';
import { PURCHASE_ADMIN_ROLES } from '@/lib/purchasing/roles';
import { getApiErrorMessage } from '@/lib/apiErrors';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import StatusBadge from '@/components/admin/StatusBadge';
import CountSheet from './CountSheet';
import { formatDateTimeIST } from '@/lib/dates';

/**
 * Count sheet. Only the person who started the count records and submits it;
 * an admin other than the counter approves, which turns every variance into an
 * approved adjustment (two-person rule, C-46).
 */
export default function CountDetail({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const { data: c, isLoading, error, refetch, isFetching } = useQuery({ queryKey: stockControlKeys.count(id), queryFn: () => fetchCount(id) });
  const [values, setValues] = useState<Record<string, string>>({});
  // e.g. 409 "Stock moved during the count for …; start a new count for these batches"
  const [approveError, setApproveError] = useState('');
  useEffect(() => {
    if (!c) return;
    setValues(Object.fromEntries(c.lines.map((l) => [l.batch_id, l.counted_qty == null ? '' : String(l.counted_qty)])));
  }, [c]);

  const isCounter = !!c && c.counted_by === me?.id;
  const editable = c?.status === 'open' && isCounter;
  const canApprove = c?.status === 'submitted' && !isCounter && hasRole(me?.role, PURCHASE_ADMIN_ROLES);
  const typed = Object.entries(values).filter(([, v]) => v !== '');
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['stock'] });
  const onError = (fallback: string) => (err: unknown) => toast.error(getApiErrorMessage(err, fallback));

  const save = useMutation({
    mutationFn: () => saveCountLines(id, typed.map(([batch_id, v]) => ({ batch_id, counted_qty: Number(v) }))),
    onSuccess: () => toast.success('Counts saved'),
    onError: onError('Could not save the counts'),
    onSettled: refresh,
  });
  const submit = useMutation({
    mutationFn: async () => {
      await saveCountLines(id, typed.map(([batch_id, v]) => ({ batch_id, counted_qty: Number(v) })));
      await submitCount(id);
    },
    onSuccess: () => toast.success('Count submitted for approval'),
    onError: onError('Could not submit the count'),
    onSettled: refresh,
  });
  const approve = useMutation({
    mutationFn: () => {
      setApproveError('');
      return approveCount(id);
    },
    onSuccess: (r) => toast.success(`Count approved · ${r.variances} variance(s) posted as adjustments`),
    onError: (err: any) => {
      const message = getApiErrorMessage(err, 'Could not approve the count');
      if (err?.response?.status === 409) setApproveError(message);
      else toast.error(message);
    },
    onSettled: refresh,
  });

  const missing = c ? c.lines.length - typed.length : 0;
  const busy = save.isPending || submit.isPending || approve.isPending;
  return (
    <div>
      <QueryState isLoading={isLoading} error={error} isEmpty={!c} emptyText="Count not found" />
      {c && (
        <>
          <PageHeader
            title={c.count_no}
            subtitle={
              <>
                {c.scope} · started {formatDateTimeIST(c.created_at)} <StatusBadge status={c.status} />
              </>
            }
            onRefresh={() => refetch()}
            refreshing={isFetching}
            actions={
              <>
                {editable && (
                  <>
                    <button onClick={() => save.mutate()} disabled={busy || !typed.length} className="btn-outline text-sm">
                      Save
                    </button>
                    <button
                      onClick={() => submit.mutate()}
                      disabled={busy || missing > 0}
                      title={missing ? `${missing} batch(es) not counted yet` : undefined}
                      className="btn-primary text-sm inline-flex items-center gap-2"
                    >
                      {submit.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Submit
                    </button>
                  </>
                )}
                {canApprove && (
                  <button onClick={() => approve.mutate()} disabled={busy} className="btn-primary text-sm inline-flex items-center gap-2">
                    {approve.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Approve variances
                  </button>
                )}
              </>
            }
          />
          {editable && (
            <p className="text-xs text-gray-500 mb-3">
              Count what is physically on the shelf. {missing ? `${missing} batch(es) still to count.` : 'All batches counted.'}
            </p>
          )}
          {approveError && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">{approveError}</p>
          )}
          {c.status === 'submitted' && isCounter && (
            <p className="text-xs text-gray-500 mb-3">Waiting for an admin other than you to approve.</p>
          )}
          <CountSheet lines={c.lines} values={values} onChange={editable ? (b, v) => setValues((p) => ({ ...p, [b]: v })) : undefined} showSystem={c.status !== 'open'} />
        </>
      )}
    </div>
  );
}
