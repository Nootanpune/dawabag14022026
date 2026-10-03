'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import QueryState from '@/components/admin/QueryState';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { fetchAdminPartnerFeed, stockFeedKeys, updateAdminPartnerFeed, type FeedSettingsInput, type FeedStatus } from '@/lib/stockFeed';
import FeedStatusLine from './FeedStatusLine';
import UrgentBadge from './UrgentBadge';

const formOf = (s: FeedStatus): Required<FeedSettingsInput> => ({
  mode: s.mode, stale_after_minutes: s.stale_after_minutes, stale_policy: s.stale_policy,
  stale_margin_pct: s.stale_margin_pct, billing_grace_minutes: s.billing_grace_minutes,
});

/**
 * Sprint 37 — Admin → Partners → (partner): manual or live stock feed (opt-in per partner)
 * and what happens when the feed goes quiet. Switching to live makes the partner's
 * software the only authority for its quantities (the portal editor is refused).
 */
export default function FeedSettingsCard({ partnerId }: { partnerId: string }) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: stockFeedKeys.adminPartner(partnerId), queryFn: () => fetchAdminPartnerFeed(partnerId) });
  const [v, setV] = useState<Required<FeedSettingsInput> | null>(null);
  useEffect(() => { if (data) setV(formOf(data)); }, [data]);
  const save = useMutation({
    mutationFn: (body: FeedSettingsInput) => updateAdminPartnerFeed(partnerId, body),
    onSuccess: (s) => { toast.success('Stock feed saved'); qc.setQueryData(stockFeedKeys.adminPartner(partnerId), s); qc.invalidateQueries({ queryKey: ['stock-feed'] }); },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Could not save the stock feed settings')),
  });
  const num = (k: keyof FeedSettingsInput) => (e: React.ChangeEvent<HTMLInputElement>) => v && setV({ ...v, [k]: Number(e.target.value) });

  return (
    <section className="card space-y-3" aria-labelledby="feed-settings-heading" data-testid="feed-settings">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="feed-settings-heading" className="text-base font-semibold">Stock feed</h2>
        {data && <UrgentBadge count={data.waiting_checks} />}
      </div>
      <QueryState isLoading={isLoading} error={error} isEmpty={false} emptyText="" />
      {data && v && (
        <>
          <FeedStatusLine s={data} />
          {data.waiting_checks > 0 && (
            <p className="text-sm"><Link className="text-brand-700 underline" href="/admin/stock-feeds">See the {data.waiting_checks} item(s) waiting for the partner</Link></p>
          )}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Mode</legend>
            {(['manual', 'live'] as const).map((m) => (
              <label key={m} className="flex items-start gap-2 text-sm">
                <input type="radio" name="feed-mode" className="mt-1" checked={v.mode === m} onChange={() => setV({ ...v, mode: m })} />
                <span>{m === 'manual'
                  ? 'Manual — the partner uploads its stock file and applies it in the portal'
                  : 'Live — snapshots from the partner\'s billing software update quantities automatically; new products and price changes wait for the partner'}</span>
              </label>
            ))}
          </fieldset>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-sm">Stale after (minutes without a snapshot)
              <input type="number" min={2} max={1440} className="input mt-1" value={v.stale_after_minutes} onChange={num('stale_after_minutes')} />
            </label>
            <label className="text-sm">When stale
              <select className="input mt-1" value={v.stale_policy} onChange={(e) => setV({ ...v, stale_policy: e.target.value as 'hide' | 'margin' })}>
                <option value="hide">Offer none of its stock (safer)</option>
                <option value="margin">Offer only what is above a safety margin</option>
              </select>
            </label>
            {v.stale_policy === 'margin' && (
              <label className="text-sm">Safety margin held back (%)
                <input type="number" min={1} max={99} className="input mt-1" value={v.stale_margin_pct} onChange={num('stale_margin_pct')} />
              </label>
            )}
            <label className="text-sm">Minutes the partner may take to bill a dispatched order
              <input type="number" min={0} max={240} className="input mt-1" value={v.billing_grace_minutes} onChange={num('billing_grace_minutes')} />
            </label>
          </div>
          {v.mode === 'live' && data.mode !== 'live' && (
            <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded p-2">
              Until the first snapshot arrives this partner&apos;s stock is not offered, and its portal stock editor and file apply stop working.
            </p>
          )}
          <div className="flex justify-end">
            <button type="button" className="btn-primary text-sm" disabled={save.isPending} onClick={() => save.mutate(v)}>Save stock feed</button>
          </div>
        </>
      )}
    </section>
  );
}
