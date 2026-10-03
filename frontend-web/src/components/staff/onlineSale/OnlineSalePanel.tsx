'use client';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import { useAuthStore } from '@/store/authStore';
import { formatDateTimeIST } from '@/lib/dates';
import { NEVER_ONLINE_SCHEDULES, ONLINE_SALE_LABELS, fetchOnlineSale, onlineSaleKeys, type OnlineSaleRow, type OnlineSaleStatus } from '@/lib/onlineSale/api';
import OnlineSaleBadge from './OnlineSaleBadge';
import ChangeDialog from './ChangeDialog';
import HistoryDialog from './HistoryDialog';

const TABS: (OnlineSaleStatus | '')[] = ['restricted', 'permitted', 'prohibited', ''];

/**
 * Online-sale status of every catalogue product (Sprint 39, owner decision 2026-10-03; C-10).
 * New products start "not allowed online yet" until a pharmacist allows them with a dated
 * reference. Pharmacists and admins can stop a product at once (one or many).
 */
export default function OnlineSalePanel() {
  const canAllow = useAuthStore((s) => s.user?.role) === 'pharmacist_rx';
  const [tab, setTab] = useState<OnlineSaleStatus | ''>('restricted');
  const [q, setQ] = useState('');
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<{ kind: 'change'; rows: OnlineSaleRow[] } | { kind: 'log'; row: OnlineSaleRow } | null>(null);
  // A link from the product list opens the screen on that product (?q=SKU)
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get('q');
    if (v) { setQ(v); setTab(''); }
  }, []);
  const { data, isLoading, error, refetch, isFetching } = useQuery({ queryKey: onlineSaleKeys.list(tab, q), queryFn: () => fetchOnlineSale(tab, q) });
  const rows = useMemo(() => data?.products ?? [], [data]);
  const count = (s: OnlineSaleStatus) => data?.counts.find((c) => c.online_sale_status === s)?.n ?? 0;
  const toggle = (id: string) => setChosen((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const picked = rows.filter((r) => chosen.has(r.id));

  return (
    <div>
      <PageHeader title="Online-sale status" onRefresh={() => refetch()} refreshing={isFetching}
        subtitle="Only products allowed online are shown to buyers or sold (Dawabag's stock and partners'). New products start not allowed until a pharmacist allows them with a dated reference." />
      <div className="flex flex-wrap items-center gap-2 mb-3" role="tablist" aria-label="Status">
        {TABS.map((s) => (
          <button key={s || 'all'} role="tab" aria-selected={tab === s} onClick={() => { setTab(s); setChosen(new Set()); }}
            className={`text-sm rounded-full px-3 py-1 border ${tab === s ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-700 border-gray-200'}`}>
            {s ? `${ONLINE_SALE_LABELS[s]} (${count(s)})` : 'All'}
          </button>
        ))}
        <label htmlFor="os-q" className="sr-only">Find a product</label>
        <input id="os-q" type="search" className="input max-w-xs ml-auto" placeholder="Find by name or SKU" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {picked.length > 0 && (
        <div className="flex items-center gap-3 mb-3 p-2 rounded-lg bg-gray-50 border border-gray-200 text-sm">
          <span>{picked.length} chosen</span>
          <button type="button" className="btn-primary text-sm py-1" onClick={() => setDialog({ kind: 'change', rows: picked })}>Set status…</button>
          <button type="button" className="text-sm underline" onClick={() => setChosen(new Set())}>Clear</button>
        </div>
      )}
      <QueryState isLoading={isLoading} error={error} isEmpty={!rows.length} emptyText="No products here." />
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b">
                <th className="py-2 pr-2"><span className="sr-only">Choose</span></th>
                <th className="py-2 pr-2">Product</th><th className="py-2 pr-2">Schedule</th><th className="py-2 pr-2">Online sale</th>
                <th className="py-2 pr-2">Reference / reason</th><th className="py-2 pr-2">Set</th><th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const never = NEVER_ONLINE_SCHEDULES.includes(r.drug_schedule);
                return (
                  <tr key={r.id} className="border-b border-gray-100 align-top" data-testid="online-sale-row">
                    <td className="py-2 pr-2"><input type="checkbox" checked={chosen.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Choose ${r.name}`} /></td>
                    <td className="py-2 pr-2"><p className="font-medium">{r.name}</p><p className="text-xs text-gray-500">{r.sku}{r.is_active ? '' : ' · inactive'}
                      {r.product_class === 'device' ? ' · medical device' : ''}{r.is_new_drug ? ' · new drug' : ''}</p></td>
                    <td className="py-2 pr-2 text-xs">{r.drug_schedule}</td>
                    <td className="py-2 pr-2"><OnlineSaleBadge status={r.online_sale_status} /></td>
                    <td className="py-2 pr-2 text-xs text-gray-700 max-w-xs">
                      {r.online_sale_ref && <p>{r.online_sale_ref}{r.online_sale_ref_date ? ` (${r.online_sale_ref_date})` : ''}</p>}
                      {r.online_sale_reason && <p className="text-gray-500">{r.online_sale_reason}</p>}
                    </td>
                    <td className="py-2 pr-2 text-xs text-gray-600">{r.online_sale_set_at ? formatDateTimeIST(r.online_sale_set_at) : '—'}{r.online_sale_set_by_name ? ` · ${r.online_sale_set_by_name}` : ''}</td>
                    <td className="py-2 whitespace-nowrap text-right">
                      <button type="button" className="text-xs underline text-brand-700 mr-2" onClick={() => setDialog({ kind: 'change', rows: [r] })}
                        disabled={never && !canAllow && r.online_sale_status === 'prohibited'}>Change</button>
                      <button type="button" className="text-xs underline text-gray-700" onClick={() => setDialog({ kind: 'log', row: r })}>History</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {dialog?.kind === 'change' && <ChangeDialog products={dialog.rows} canAllow={canAllow} onClose={() => { setDialog(null); setChosen(new Set()); }} />}
      {dialog?.kind === 'log' && <HistoryDialog product={dialog.row} onClose={() => setDialog(null)} />}
    </div>
  );
}
