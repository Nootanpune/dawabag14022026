'use client';
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { movedText, usedByText } from '@/lib/admin/catalogueListsAdmin';

export interface MergeChoice { key: string; label: string; hint?: string }

interface Props {
  /** "category" or "HSN code" — used in the wording */
  what: 'category' | 'HSN code';
  source: { key: string; label: string; product_count: number };
  /** Switched-on entries that are not merged; the source is left out here */
  choices: MergeChoice[];
  /** HSN merges change a tax classification: a reason is required */
  reasonRequired: boolean;
  onMerge: (intoKey: string, reason: string) => Promise<{ products_moved: number }>;
  onClose: () => void;
  onDone: (msg: string) => void;
}

/**
 * Sprint 36 — merge a duplicate list entry into another (Admin → Catalogue lists).
 * Every product under it moves in one step on the server; the old entry stays
 * switched off and points at the new one. Audited on the server (C-46).
 */
export default function MergeDialog({ what, source, choices, reasonRequired, onMerge, onClose, onDone }: Props) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState('');
  const [into, setInto] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return choices.filter((c) => c.key !== source.key && (!f || c.label.toLowerCase().includes(f))).slice(0, 200);
  }, [choices, filter, source.key]);
  const target = choices.find((c) => c.key === into);
  const merge = useMutation({
    mutationFn: () => onMerge(into, reason),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['catalogue-lists'] });
      onDone(`${source.label} merged into ${target?.label ?? 'the chosen entry'} — ${movedText(r.products_moved)}`);
    },
    onError: (e) => setError(getApiErrorMessage(e, `Could not merge the ${what}`)),
  });
  const submit = () => {
    if (!into) return setError(`Choose the ${what} to merge into`);
    if (reasonRequired && reason.trim().length < 5) return setError('Say why the two are the same (at least 5 characters)');
    setError('');
    merge.mutate();
  };
  return (
    <Modal title={`Merge ${source.label}`} onClose={onClose} size="lg">
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-3">
        <p className="text-sm text-gray-700">
          {usedByText(source.product_count)}. They will all move to the {what} you choose, in one step.
          {' '}{source.label} is then switched off and kept only so that files naming it still find the new one.
        </p>
        <div>
          <label htmlFor="merge-filter" className="block text-sm font-medium text-gray-700 mb-1">Find the {what} to merge into</label>
          <input id="merge-filter" className="input w-full" value={filter} onChange={(e) => setFilter(e.target.value)} autoFocus />
        </div>
        <fieldset>
          <legend className="block text-sm font-medium text-gray-700 mb-1">Merge into</legend>
          <div className="max-h-56 overflow-y-auto border rounded-lg divide-y divide-gray-100" data-testid="merge-choices">
            {shown.length === 0 && <p className="text-sm text-gray-500 p-3">No switched-on {what} matches</p>}
            {shown.map((c) => (
              <label key={c.key} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                <input type="radio" name="merge-into" value={c.key} checked={into === c.key} onChange={() => setInto(c.key)} />
                <span className="flex-1">{c.label}</span>
                {c.hint && <span className="text-xs text-gray-500">{c.hint}</span>}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="merge-reason" className="block text-sm font-medium text-gray-700 mb-1">
            Why are they the same?{reasonRequired ? '' : ' (optional)'}
          </label>
          <input id="merge-reason" className="input w-full" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder={what === 'HSN code' ? 'e.g. typed the 4-digit code instead of 30049099' : 'e.g. same shelf, added twice'} />
          {what === 'HSN code' && (
            <p className="text-xs text-gray-500 mt-1">A code already on a sold order cannot be merged: invoices show the product&rsquo;s HSN code.</p>
          )}
        </div>
        <DialogActions onCancel={onClose} onConfirm={submit} confirmLabel={target ? `Merge into ${target.label}` : 'Merge'}
          pending={merge.isPending} error={error} />
      </form>
    </Modal>
  );
}
