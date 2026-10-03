'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import QueryState from '@/components/admin/QueryState';
import { useAuthStore } from '@/store/authStore';
import { ACTION_LABELS, fetchActions, siKeys, type CorrectiveAction } from '@/lib/selfInspection/api';
import ActionStatusDialog from './ActionStatusDialog';

const TABS = [['open', 'Open'], ['overdue', 'Overdue'], ['closed', 'Closed'], ['', 'All']] as const;

/** Corrective actions from self-inspections; overdue ones alert admins daily until closed (C-34). */
export default function ActionList() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('open');
  const [open, setOpen] = useState<CorrectiveAction | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: siKeys.actions(tab), queryFn: () => fetchActions(tab) });
  const rows = data ?? [];
  return (
    <section aria-labelledby="capa" className="mb-6">
      <h2 id="capa" className="text-sm font-semibold text-gray-800 mb-2">Corrective actions</h2>
      <div className="flex gap-2 mb-2" role="tablist" aria-label="Actions">
        {TABS.map(([k, label]) => (
          <button key={k || 'all'} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`text-xs rounded-full px-3 py-1 border ${tab === k ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-700 border-gray-200'}`}>{label}</button>
        ))}
      </div>
      <QueryState isLoading={isLoading} error={error} isEmpty={!rows.length} emptyText="No corrective actions here." />
      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((a) => (
            <li key={a.id} className="card text-sm flex flex-wrap justify-between gap-2" data-testid="capa-row">
              <div>
                <p className="font-medium"><span className="font-mono text-xs">{a.action_no}</span> · {a.description}</p>
                <p className="text-xs text-gray-500">{a.template_name} ({a.inspection_no}){a.item_label ? ` · ${a.item_label}` : ''} · owner {a.owner_name ?? '—'} · due {a.due_date}</p>
                {a.close_out_note && <p className="text-xs text-gray-600">Closed: {a.close_out_note}</p>}
              </div>
              <div className="flex items-center gap-2">
                {a.overdue && <span className="urgent-badge">Overdue</span>}
                <span className="text-xs rounded-full px-2 py-0.5 bg-gray-100">{ACTION_LABELS[a.status]}</span>
                {a.status !== 'closed' && (isAdmin || a.owner_user_id === user?.id) && (
                  <button type="button" className="btn-outline text-xs py-1" onClick={() => setOpen(a)}>Update…</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {open && <ActionStatusDialog action={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
