'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import BackLink from '@/components/admin/BackLink';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { todayIST } from '@/lib/dates';
import {
  RESULT_LABELS, fetchActionOwners, fetchTemplates, inspectionProblem, recordInspection, siKeys, type ItemResult, type ResultInput,
} from '@/lib/selfInspection/api';

const RESULTS: ItemResult[] = ['ok', 'observation', 'non_conformity'];

/** Record one inspection against a checklist: every item answered; a non-conformity gets a corrective action (C-34). */
export default function RecordInspectionForm({ templateId }: { templateId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const templates = useQuery({ queryKey: siKeys.templates(false), queryFn: () => fetchTemplates(false) });
  const owners = useQuery({ queryKey: siKeys.people, queryFn: fetchActionOwners });
  const t = useMemo(() => templates.data?.find((x) => x.id === templateId), [templates.data, templateId]);
  const [results, setResults] = useState<Record<string, ResultInput>>({});
  const [summary, setSummary] = useState('');
  const today = todayIST();
  const set = (key: string, patch: Partial<ResultInput>) => setResults((r) => ({ ...r, [key]: { ...(r[key] ?? { item_key: key, result: 'ok' }), ...patch } }));
  const problem = t ? inspectionProblem(t.items, results, today) : 'Loading…';
  const save = useMutation({
    mutationFn: () => recordInspection({ template_id: templateId, summary: summary.trim() || null, results: t!.items.map((i) => results[i.key]) }),
    onSuccess: (r) => {
      toast.success(`${r.inspection_no} recorded${r.corrective_actions.length ? ` with ${r.corrective_actions.length} corrective action(s)` : ''}`);
      queryClient.invalidateQueries({ queryKey: siKeys.all });
      router.push(`/staff/self-inspections/${r.id}`);
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Could not record the inspection')),
  });
  return (
    <div>
      <BackLink href="/staff/self-inspections" label="Self-inspections" />
      <QueryState isLoading={templates.isLoading} error={templates.error} isEmpty={!templates.isLoading && !t} emptyText="Checklist not found." />
      {t && (
        <>
          <PageHeader title={`Inspection: ${t.name}`} subtitle="Answer every item. An observation or non-conformity needs a note; a non-conformity needs a corrective action with an owner and a due date." />
          <ol className="space-y-3">
            {t.items.map((i, n) => {
              const r = results[i.key];
              return (
                <li key={i.key} className="card text-sm" data-testid="si-item">
                  <fieldset>
                    <legend className="font-medium">{n + 1}. {i.label}</legend>
                    {i.guidance && <p className="text-xs text-gray-500">{i.guidance}</p>}
                    <div className="flex flex-wrap gap-3 mt-2">
                      {RESULTS.map((res) => (
                        <label key={res} className="flex items-center gap-1.5">
                          <input type="radio" name={`r-${i.key}`} checked={r?.result === res}
                            onChange={() => set(i.key, { result: res, action: res === 'non_conformity' ? (r?.action ?? { description: '', owner_user_id: '', due_date: '' }) : r?.action ?? null })} />
                          {RESULT_LABELS[res]}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  {r && r.result !== 'ok' && (
                    <label className="block mt-2"><span className="block text-xs text-gray-700 mb-0.5">What was found</span>
                      <input className="input" value={r.note ?? ''} onChange={(e) => set(i.key, { note: e.target.value })} />
                    </label>
                  )}
                  {r?.action && (
                    <div className="grid sm:grid-cols-3 gap-2 mt-2 p-2 rounded bg-gray-50">
                      <label className="block sm:col-span-3"><span className="block text-xs text-gray-700 mb-0.5">Corrective action</span>
                        <input className="input" value={r.action.description} onChange={(e) => set(i.key, { action: { ...r.action!, description: e.target.value } })} />
                      </label>
                      <label className="block sm:col-span-2"><span className="block text-xs text-gray-700 mb-0.5">Owner</span>
                        <select className="input" value={r.action.owner_user_id} onChange={(e) => set(i.key, { action: { ...r.action!, owner_user_id: e.target.value } })}>
                          <option value="">Choose…</option>
                          {(owners.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.name} ({o.role})</option>)}
                        </select>
                      </label>
                      <label className="block"><span className="block text-xs text-gray-700 mb-0.5">Due date</span>
                        <input type="date" className="input" min={today} value={r.action.due_date} onChange={(e) => set(i.key, { action: { ...r.action!, due_date: e.target.value } })} />
                      </label>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          <label className="block text-sm mt-4"><span className="block font-medium text-gray-700 mb-1">Summary (optional)</span>
            <textarea className="input" rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} />
          </label>
          {problem && <p className="text-xs text-amber-800 mt-2" role="status">{problem}</p>}
          <div className="flex justify-end mt-3">
            <button type="button" className="btn-primary text-sm disabled:opacity-50" disabled={!!problem || save.isPending} onClick={() => save.mutate()}>Save inspection</button>
          </div>
        </>
      )}
    </div>
  );
}
