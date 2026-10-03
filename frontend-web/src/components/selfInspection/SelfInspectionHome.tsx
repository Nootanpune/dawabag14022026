'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import { useAuthStore } from '@/store/authStore';
import { formatDateTimeIST } from '@/lib/dates';
import { fetchInspections, fetchTemplates, siKeys } from '@/lib/selfInspection/api';
import ActionList from './ActionList';

/**
 * Self-inspection register (Sprint 40; O15; C-34): the checklists and when each is due,
 * corrective actions, and every inspection recorded (append-only).
 */
export default function SelfInspectionHome() {
  const role = useAuthStore((s) => s.user?.role);
  const mayRecord = role === 'pharmacist_rx' || role === 'admin' || role === 'super_admin';
  const isAdmin = role === 'admin' || role === 'super_admin';
  const templates = useQuery({ queryKey: siKeys.templates(false), queryFn: () => fetchTemplates(false) });
  const inspections = useQuery({ queryKey: siKeys.list, queryFn: fetchInspections });
  return (
    <div>
      <PageHeader title="Self-inspections" onRefresh={() => { templates.refetch(); inspections.refetch(); }}
        subtitle="Regular checks of storage, expiry segregation, licences, the pharmacist on duty, the H1 register, cold-chain equipment, pest control and records. Results cannot be changed once saved."
        actions={isAdmin ? <Link href="/staff/self-inspections/templates" className="btn-outline text-sm">Checklists</Link> : undefined} />
      <section aria-labelledby="si-due" className="mb-6">
        <h2 id="si-due" className="text-sm font-semibold text-gray-800 mb-2">Checklists due</h2>
        <QueryState isLoading={templates.isLoading} error={templates.error} isEmpty={!templates.data?.length} emptyText="No checklist yet." />
        <ul className="grid sm:grid-cols-2 gap-2">
          {(templates.data ?? []).map((t) => (
            <li key={t.id} className="card text-sm flex justify-between gap-2" data-testid="si-template">
              <div>
                <p className="font-medium">{t.name}</p>
                <p className="text-xs text-gray-500">{t.frequency} · {t.items.length} items · last {t.last_inspected_on ?? 'never'} · next due {t.next_due_on}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                {t.overdue && <span className="urgent-badge">Overdue</span>}
                {mayRecord && <Link href={`/staff/self-inspections/new?template=${t.id}`} className="btn-primary text-xs py-1">Record inspection</Link>}
              </div>
            </li>
          ))}
        </ul>
      </section>
      <ActionList />
      <section aria-labelledby="si-history">
        <h2 id="si-history" className="text-sm font-semibold text-gray-800 mb-2">Inspections</h2>
        <QueryState isLoading={inspections.isLoading} error={inspections.error} isEmpty={!inspections.data?.length} emptyText="No inspection recorded yet." />
        {!!inspections.data?.length && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-gray-500 border-b"><th className="py-2 pr-2">No.</th><th className="py-2 pr-2">Checklist</th><th className="py-2 pr-2">When / who</th><th className="py-2 pr-2">Results</th><th className="py-2">Open actions</th></tr></thead>
              <tbody>
                {inspections.data.map((i) => (
                  <tr key={i.id} className="border-b border-gray-100">
                    <td className="py-2 pr-2"><Link href={`/staff/self-inspections/${i.id}`} className="text-brand-700 underline font-mono text-xs">{i.inspection_no}</Link></td>
                    <td className="py-2 pr-2">{i.template_name}</td>
                    <td className="py-2 pr-2 text-xs">{formatDateTimeIST(i.inspected_at)} · {i.inspector_name ?? i.inspector_role}</td>
                    <td className="py-2 pr-2 text-xs">{i.ok_count} ok · {i.observation_count} observation(s) · {i.non_conformity_count} non-conformit{i.non_conformity_count === 1 ? 'y' : 'ies'}</td>
                    <td className="py-2 text-xs">{i.open_actions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
