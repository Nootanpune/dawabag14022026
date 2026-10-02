'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Send, Save } from 'lucide-react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { medicineInfoKeys, saveInfoDraft, submitInfo } from '@/lib/medicineInfo/api';
import { STATUS_LABEL, type InfoEditorData } from '@/lib/medicineInfo/types';
import { fromForm, toForm, type EditorForm } from '@/lib/medicineInfo/form';
import { FieldGroup, TextField } from './EditorFields';
import SafetyFields from './SafetyFields';
import FactFields from './FactFields';
import PairsFields from './PairsFields';

/**
 * Writes medicine information as a draft and sends it to the pharmacist's review
 * (C-19). Live text keeps showing until a new version is approved. Words come from
 * the manufacturer's package insert — never copied from another pharmacy's site.
 */
export default function MedicineInfoEditor({ data }: { data: InfoEditorData }) {
  const queryClient = useQueryClient();
  const productId = data.product.id;
  const [form, setForm] = useState<EditorForm>(() => toForm(data.open?.content ?? data.start_from));
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof EditorForm>(k: K) => (v: EditorForm[K]) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); };
  const refresh = () => queryClient.invalidateQueries({ queryKey: medicineInfoKeys.editor(productId) });

  const save = useMutation({
    mutationFn: () => saveInfoDraft(productId, fromForm(form)),
    onSuccess: (r) => { setDirty(false); setError(''); toast.success(`Draft saved (version ${r.version})`); refresh(); },
    onError: (e) => setError(getApiErrorMessage(e, 'Could not save the draft')),
  });
  const submit = useMutation({
    mutationFn: async () => { if (dirty || !data.open) await saveInfoDraft(productId, fromForm(form)); return submitInfo(productId); },
    onSuccess: () => { setDirty(false); setError(''); toast.success('Sent to the pharmacist for review'); refresh(); },
    onError: (e) => setError(getApiErrorMessage(e, 'Could not send it for review')),
  });
  const busy = save.isPending || submit.isPending;
  const open = data.open;
  const flags = open?.flags ?? [];

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }} aria-label="Medicine information editor">
      <div className="card text-sm space-y-1" data-testid="info-status">
        <p>
          <span className="font-semibold">Live for buyers: </span>
          {data.live ? `version ${data.live.version}, reviewed by ${data.live.reviewer_name} (Reg. no. ${data.live.reviewer_reg_no})` : 'nothing yet'}
        </p>
        <p>
          <span className="font-semibold">Being written: </span>
          {open ? `version ${open.version} — ${STATUS_LABEL[open.status]}` : 'no draft (saving starts a new version)'}
        </p>
        {data.last_rejected?.review_notes && (
          <p className="text-red-800">Version {data.last_rejected.version} was rejected: “{data.last_rejected.review_notes}”</p>
        )}
        {open?.status === 'pending_review' && (
          <p className="text-amber-800">Saving changes now takes it back to draft; send it for review again afterwards.</p>
        )}
        {flags.length > 0 && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-2 text-xs text-red-800">
            <p className="font-semibold flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Possible prohibited claims (C-19)</p>
            {flags.map((f, i) => <p key={i}>{f.condition} ({f.claim}): “{f.excerpt}”</p>)}
          </div>
        )}
        <p className="text-xs text-gray-500">
          Write only from the manufacturer’s package insert or prescribing information, in plain words. Empty sections are hidden from buyers.
        </p>
      </div>

      <FieldGroup title="Overview and use">
        <TextField id="mi-overview" label="Overview" value={form.overview} onChange={set('overview')} rows={3} />
        <TextField id="mi-uses" label="Uses" list value={form.uses} onChange={set('uses')} />
        <TextField id="mi-how-to-use" label="How to use" value={form.how_to_use} onChange={set('how_to_use')} />
        <TextField id="mi-how-it-works" label="How it works" value={form.how_it_works} onChange={set('how_it_works')} />
        <TextField id="mi-missed-dose" label="Missed dose" value={form.missed_dose} onChange={set('missed_dose')} rows={2} />
        <TextField id="mi-tips" label="Quick tips" list value={form.quick_tips} onChange={set('quick_tips')} />
      </FieldGroup>

      <FieldGroup title="Side effects">
        <TextField id="mi-se-common" label="Common" list value={form.se_common} onChange={set('se_common')} />
        <TextField id="mi-se-serious" label="Serious" list value={form.se_serious} onChange={set('se_serious')} />
        <TextField id="mi-se-contact" label="Contact your doctor if" list value={form.se_contact} onChange={set('se_contact')} />
      </FieldGroup>

      <FieldGroup title="Safety advice">
        <SafetyFields value={form.safety} onChange={set('safety')} />
      </FieldGroup>

      <FieldGroup title="Interactions">
        <TextField id="mi-ix-med" label="With other medicines" list value={form.ix_medicines} onChange={set('ix_medicines')} />
        <TextField id="mi-ix-food" label="With food" list value={form.ix_food} onChange={set('ix_food')} rows={2} />
        <TextField id="mi-ix-cond" label="With health conditions" list value={form.ix_conditions} onChange={set('ix_conditions')} rows={2} />
      </FieldGroup>

      <FieldGroup title="Fact box">
        <FactFields value={form.facts} onChange={set('facts')} />
      </FieldGroup>

      <FieldGroup title="FAQs">
        <PairsFields rows={form.faqs} keys={['question', 'answer'] as const} labels={['Question', 'Answer'] as const}
          addLabel="Add a question" multiline onChange={set('faqs')} />
      </FieldGroup>

      <FieldGroup title="References (required before review)">
        <PairsFields rows={form.references} keys={['source', 'date'] as const} labels={['Source', 'Date'] as const}
          placeholders={['Manufacturer’s package insert', 'e.g. March 2026'] as const} addLabel="Add a source" onChange={set('references')} />
      </FieldGroup>

      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>}
      <div className="sticky bottom-0 bg-gray-50/95 backdrop-blur py-3 flex flex-wrap gap-2 justify-end border-t border-gray-200">
        <button type="submit" disabled={busy} className="btn-outline inline-flex items-center gap-1.5 text-sm">
          {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save draft
        </button>
        <button type="button" disabled={busy || (open?.status === 'pending_review' && !dirty)} onClick={() => submit.mutate()}
          className="btn-primary inline-flex items-center gap-1.5 text-sm">
          {submit.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send for pharmacist review
        </button>
      </div>
    </form>
  );
}
