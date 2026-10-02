'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QueryState from '@/components/admin/QueryState';
import type { HsnCode } from '@/lib/catalogueLists';
import { fetchAllHsnCodes, manageKeys, updateHsnCode, usedByText } from '@/lib/admin/catalogueListsAdmin';
import { getApiErrorMessage } from '@/lib/apiErrors';
import ListSearch from './ListSearch';
import ActiveBadge from './ActiveBadge';
import ActiveToggleButton from './ActiveToggleButton';
import EditHsnDialog from './EditHsnDialog';

/** HSN codes: search, edit words / GST (correct the code while unused), switch off / on. Read-only for pharmacists. */
export default function HsnTab({ canEdit, onMessage }: { canEdit: boolean; onMessage: (m: { ok: boolean; text: string }) => void }) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<HsnCode | null>(null);
  const { data = [], isLoading, error } = useQuery({ queryKey: manageKeys.hsn(q), queryFn: () => fetchAllHsnCodes(q), placeholderData: (prev) => prev });
  const toggle = useMutation({
    mutationFn: (h: HsnCode) => updateHsnCode(h.code, { is_active: !h.is_active }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['catalogue-lists'] });
      onMessage({ ok: true, text: r.hsn.is_active
        ? `HSN ${r.hsn.code} is back in the pick-lists`
        : `HSN ${r.hsn.code} is switched off — products that have it keep it` });
    },
    onError: (e) => onMessage({ ok: false, text: getApiErrorMessage(e, 'Could not change the HSN code') }),
  });
  return (
    <section aria-label="HSN codes">
      <ListSearch value={q} onChange={setQ} label="Search HSN codes or descriptions" />
      <QueryState isLoading={isLoading} error={error} isEmpty={!isLoading && data.length === 0} emptyText={q ? 'No HSN code matches' : 'No HSN codes yet'} />
      {data.length > 0 && (
        <ul className="divide-y divide-gray-100 card p-0" data-testid="hsn-list">
          {data.map((h) => (
            <li key={h.code} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3" data-testid="hsn-row">
              <div className="flex-1 min-w-[12rem]">
                <p className={`font-medium tabular-nums ${h.is_active ? 'text-gray-900' : 'text-gray-500'}`}>
                  {h.code}
                  <span className="font-normal text-gray-600"> — {h.description || 'No description yet'}</span>
                </p>
                <p className="text-xs text-gray-500">
                  {h.gst_rate == null ? 'Usual GST not set' : `Usual GST ${h.gst_rate}%`} · {usedByText(h.product_count)}
                </p>
              </div>
              <ActiveBadge active={h.is_active} />
              {canEdit && (
                <div className="flex items-center gap-4">
                  <button type="button" className="text-sm text-brand-700 font-medium hover:underline underline-offset-2"
                    onClick={() => setEditing(h)} aria-label={`Edit HSN ${h.code}`}>Edit</button>
                  <ActiveToggleButton active={h.is_active} name={`HSN ${h.code}`}
                    pending={toggle.isPending && toggle.variables?.code === h.code} onClick={() => toggle.mutate(h)} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <EditHsnDialog hsn={editing} onClose={() => setEditing(null)}
          onDone={(text) => { setEditing(null); onMessage({ ok: true, text }); }} />
      )}
    </section>
  );
}
