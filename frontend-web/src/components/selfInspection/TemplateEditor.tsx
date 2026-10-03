'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import BackLink from '@/components/admin/BackLink';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { FREQUENCIES, fetchTemplates, saveTemplate, siKeys, type Frequency, type Template, type TemplateItem } from '@/lib/selfInspection/api';

interface Draft { id?: string; name: string; frequency: Frequency; is_active: boolean; items: TemplateItem[] }
const blank = (): Draft => ({ name: '', frequency: 'monthly', is_active: true, items: [{ key: '', label: '' }] });

/** Admins keep the self-inspection checklists (past inspections keep the items as they were). */
export default function TemplateEditor() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: siKeys.templates(true), queryFn: () => fetchTemplates(true) });
  const [draft, setDraft] = useState<Draft | null>(null);
  const save = useMutation({
    mutationFn: () => saveTemplate({ ...draft!, items: draft!.items.filter((i) => i.label.trim()).map((i) => ({ key: i.key || '', label: i.label.trim(), guidance: i.guidance?.trim() || null })) }),
    onSuccess: () => { toast.success('Checklist saved'); queryClient.invalidateQueries({ queryKey: siKeys.all }); setDraft(null); },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Could not save the checklist')),
  });
  const edit = (t: Template) => setDraft({ id: t.id, name: t.name, frequency: t.frequency, is_active: t.is_active, items: t.items.map((i) => ({ ...i })) });
  const setItem = (n: number, patch: Partial<TemplateItem>) => setDraft((d) => d && { ...d, items: d.items.map((i, k) => (k === n ? { ...i, ...patch } : i)) });
  return (
    <div>
      <BackLink href="/staff/self-inspections" label="Self-inspections" />
      <PageHeader title="Self-inspection checklists" subtitle="What is checked and how often. Changing a checklist does not change inspections already recorded."
        actions={<button type="button" className="btn-primary text-sm" onClick={() => setDraft(blank())}>New checklist</button>} />
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No checklist yet." />
      <ul className="space-y-2 mb-6">
        {(data ?? []).map((t) => (
          <li key={t.id} className="card text-sm flex justify-between gap-2">
            <div><p className="font-medium">{t.name}{!t.is_active ? ' (switched off)' : ''}</p><p className="text-xs text-gray-500">{t.frequency} · {t.items.length} items</p></div>
            <button type="button" className="btn-outline text-xs py-1" onClick={() => edit(t)}>Edit</button>
          </li>
        ))}
      </ul>
      {draft && (
        <section className="card text-sm space-y-3" aria-label="Checklist">
          <div className="grid sm:grid-cols-3 gap-3">
            <label className="block sm:col-span-2"><span className="block font-medium text-gray-700 mb-1">Name</span>
              <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
            <label className="block"><span className="block font-medium text-gray-700 mb-1">How often</span>
              <select className="input" value={draft.frequency} onChange={(e) => setDraft({ ...draft, frequency: e.target.value as Frequency })}>
                {FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
              </select></label>
          </div>
          <label className="flex items-center gap-2"><input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} /> In use</label>
          <ol className="space-y-2">
            {draft.items.map((i, n) => (
              <li key={n} className="flex gap-2 items-start">
                <span className="pt-2 text-xs text-gray-500 w-5">{n + 1}.</span>
                <div className="flex-1 grid sm:grid-cols-2 gap-2">
                  <input className="input" aria-label={`Item ${n + 1}`} placeholder="What is checked" value={i.label} onChange={(e) => setItem(n, { label: e.target.value })} />
                  <input className="input" aria-label={`Guidance ${n + 1}`} placeholder="Guidance (optional)" value={i.guidance ?? ''} onChange={(e) => setItem(n, { guidance: e.target.value })} />
                </div>
                <button type="button" aria-label={`Remove item ${n + 1}`} className="p-2 text-gray-400 hover:text-red-600"
                  onClick={() => setDraft({ ...draft, items: draft.items.filter((_, k) => k !== n) })}><Trash2 className="w-4 h-4" /></button>
              </li>
            ))}
          </ol>
          <button type="button" className="btn-outline text-xs inline-flex items-center gap-1" onClick={() => setDraft({ ...draft, items: [...draft.items, { key: '', label: '' }] })}><Plus className="w-3.5 h-3.5" /> Add item</button>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-outline text-sm" onClick={() => setDraft(null)}>Cancel</button>
            <button type="button" className="btn-primary text-sm disabled:opacity-50" disabled={draft.name.trim().length < 3 || !draft.items.some((i) => i.label.trim().length >= 3) || save.isPending}
              onClick={() => save.mutate()}>Save checklist</button>
          </div>
        </section>
      )}
    </div>
  );
}
