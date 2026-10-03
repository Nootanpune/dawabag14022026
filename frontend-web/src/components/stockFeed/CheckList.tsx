'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import ReasonDialog from '@/components/admin/ReasonDialog';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { dismissCheck, requestProductForCheck, type FeedCheck } from '@/lib/stockFeed';
import AcceptCheckDialog from './AcceptCheckDialog';
import CheckDetails from './CheckDetails';
import LinkFeedItemDialog from './LinkFeedItemDialog';

/**
 * Items from the live feed waiting for a person. The partner acts on them (it is the
 * seller of record, C-05); Dawabag's admins see the same list read-only.
 */
export default function CheckList({ checks, readOnly = false }: { checks: FeedCheck[]; readOnly?: boolean }) {
  const qc = useQueryClient();
  const [accepting, setAccepting] = useState<FeedCheck | null>(null);
  const [linking, setLinking] = useState<FeedCheck | null>(null);
  const [dismissing, setDismissing] = useState<FeedCheck | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['stock-feed'] });
  const done = (msg: string) => () => { toast.success(msg); setAccepting(null); setLinking(null); setDismissing(null); refresh(); };
  const request = useMutation({ mutationFn: (c: FeedCheck) => requestProductForCheck(c.id), onSuccess: done('Asked Dawabag to add it'),
    onError: (e) => toast.error(getApiErrorMessage(e, 'Could not send the request')) });
  const dismiss = useMutation({ mutationFn: ({ c, reason }: { c: FeedCheck; reason: string }) => dismissCheck(c.id, reason), onSuccess: done('Set aside'),
    onError: (e) => toast.error(getApiErrorMessage(e, 'Could not set it aside')) });

  return (
    <>
      <ul className="card p-0 divide-y divide-gray-100" data-testid="feed-check-list">
        {checks.map((c) => (
          <li key={c.id} className="px-4 py-3 flex flex-wrap items-start gap-x-4 gap-y-2 text-sm" data-testid="feed-check-row">
            <span className="text-xs font-semibold text-red-800 bg-red-50 border border-red-200 rounded-full px-2 py-0.5 shrink-0">{c.kind_label}</span>
            <div className="flex-1 min-w-[14rem]">
              {readOnly && <p className="text-xs text-gray-500">{c.partner_name}</p>}
              <CheckDetails c={c} />
            </div>
            {!readOnly && (
              <div className="flex flex-wrap gap-2">
                {c.kind === 'new_product' ? (
                  <>
                    <button type="button" className="btn-primary text-xs py-1.5 px-3" onClick={() => setLinking(c)}>Link to product</button>
                    {!c.details?.requested_at && (
                      <button type="button" className="btn-outline text-xs py-1.5 px-3" disabled={request.isPending} onClick={() => request.mutate(c)}>Ask Dawabag to add</button>
                    )}
                    <button type="button" className="text-xs text-gray-700 underline" onClick={() => setDismissing(c)}>Not sold on Dawabag</button>
                  </>
                ) : c.kind === 'short_for_orders' ? (
                  <span className="text-xs text-gray-600 max-w-xs">Correct your software or call Dawabag; clears by itself.</span>
                ) : (
                  <button type="button" className="btn-primary text-xs py-1.5 px-3" onClick={() => setAccepting(c)}>
                    {c.kind === 'new_listing' ? 'List it…' : 'Check and accept…'}
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {accepting && <AcceptCheckDialog check={accepting} onClose={() => setAccepting(null)} onDone={done('Accepted')} />}
      {linking && <LinkFeedItemDialog check={linking} onClose={() => setLinking(null)} onDone={done('Linked — the next snapshot applies it')} />}
      {dismissing && (
        <ReasonDialog title={`Set aside "${dismissing.item_name ?? ''}"?`} label="Why is it not sold on Dawabag?" confirmLabel="Set aside" minLength={3}
          pending={dismiss.isPending} onClose={() => setDismissing(null)} onConfirm={(reason) => dismiss.mutate({ c: dismissing, reason })} />
      )}
    </>
  );
}
