'use client';
import { useQuery } from '@tanstack/react-query';
import BackLink from '@/components/admin/BackLink';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import { formatDateTimeIST } from '@/lib/dates';
import { ACTION_LABELS, RESULT_LABELS, fetchInspection, siKeys } from '@/lib/selfInspection/api';

const TONE = { ok: 'text-green-700', observation: 'text-amber-700', non_conformity: 'text-red-700 font-semibold' } as const;

/** One inspection as recorded, with its corrective actions and their history (read-only, C-34). */
export default function InspectionDetail({ id }: { id: string }) {
  const { data: i, isLoading, error } = useQuery({ queryKey: siKeys.one(id), queryFn: () => fetchInspection(id) });
  return (
    <div>
      <BackLink href="/staff/self-inspections" label="Self-inspections" />
      <QueryState isLoading={isLoading} error={error} isEmpty={false} emptyText="" />
      {i && (
        <>
          <PageHeader title={`${i.inspection_no} — ${i.template_name}`} subtitle={`${formatDateTimeIST(i.inspected_at)} · ${i.inspector_name ?? i.inspector_role}${i.summary ? ` · ${i.summary}` : ''}`} />
          <table className="w-full text-sm mb-6">
            <thead><tr className="text-left text-xs text-gray-500 border-b"><th className="py-2 pr-2">Item</th><th className="py-2 pr-2">Result</th><th className="py-2">Note</th></tr></thead>
            <tbody>
              {i.results.map((r) => (
                <tr key={r.id} className="border-b border-gray-100"><td className="py-2 pr-2">{r.item_label}</td><td className={`py-2 pr-2 ${TONE[r.result]}`}>{RESULT_LABELS[r.result]}</td><td className="py-2 text-xs">{r.note ?? ''}</td></tr>
              ))}
            </tbody>
          </table>
          <h2 className="text-sm font-semibold mb-2">Corrective actions</h2>
          {!i.actions.length && <p className="text-sm text-gray-500">None.</p>}
          <ul className="space-y-2">
            {i.actions.map((a) => (
              <li key={a.id} className="card text-sm">
                <p className="font-medium"><span className="font-mono text-xs">{a.action_no}</span> · {a.description}</p>
                <p className="text-xs text-gray-500">Owner {a.owner_name ?? '—'} · due {a.due_date} · {ACTION_LABELS[a.status]}{a.overdue ? ' · OVERDUE' : ''}</p>
                <ol className="mt-1 text-xs text-gray-600 list-decimal pl-5">
                  {(a.history ?? []).map((h, n) => <li key={n}>{formatDateTimeIST(h.changed_at)} · {h.from_status ? `${ACTION_LABELS[h.from_status]} → ` : ''}{ACTION_LABELS[h.to_status]}{h.changed_by_name ? ` · ${h.changed_by_name}` : ''}{h.note ? ` — ${h.note}` : ''}</li>)}
                </ol>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
