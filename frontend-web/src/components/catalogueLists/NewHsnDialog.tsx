'use client';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';
import Modal from '@/components/admin/Modal';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { GST_SLABS, hsnProblem, tidyHsn, type HsnCode } from '@/lib/catalogueLists';

import { useCreateHsn } from './useCatalogueLists';

/** "New HSN code": code (4, 6 or 8 digits), short description, usual GST % (optional). */
export default function NewHsnDialog({ initial, list, onClose, onDone }: {
  initial: { code?: string; gst_rate?: number | null };
  list: HsnCode[];
  onClose: () => void;
  onDone: (code: string, note: string | null) => void;
}) {
  const [code, setCode] = useState(initial.code ?? '');
  const [description, setDescription] = useState('');
  const [gst, setGst] = useState(initial.gst_rate == null ? '' : String(initial.gst_rate));
  const [error, setError] = useState('');
  const create = useCreateHsn();
  const existing = list.find((h) => h.code === tidyHsn(code));

  const submit = () => {
    if (existing && existing.description) { onDone(existing.code, `HSN ${existing.code} is already in the list, so it was chosen`); return; }
    const problem = hsnProblem(code, description);
    if (problem) { setError(problem); return; }
    create.mutate({ code: tidyHsn(code), description: description.trim(), gst_rate: gst === '' ? null : Number(gst) }, {
      onSuccess: (r) => onDone(r.value.code, r.note),
      onError: (e) => setError(getApiErrorMessage(e, 'Could not add the HSN code')),
    });
  };

  // In a portal: the field may sit inside another form (product form, "Set for all chosen")
  return createPortal(
    <Modal title="New HSN code" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); submit(); }} className="space-y-3">
        <div>
          <label htmlFor="new-hsn-code" className="block text-sm font-medium text-gray-700 mb-1">HSN code</label>
          <input id="new-hsn-code" value={code} inputMode="numeric" maxLength={12} autoFocus={!initial.code} className="input font-mono"
            onChange={(e) => { setCode(e.target.value); setError(''); }} />
          <p className="text-xs text-gray-500 mt-1">
            {existing ? `HSN ${existing.code} is already in the list${existing.description ? ': saving chooses it' : ' without words: add them below'}.` : '4, 6 or 8 digits, e.g. 3004 or 30049099.'}
          </p>
        </div>
        {!(existing && existing.description) && (
          <>
            <div>
              <label htmlFor="new-hsn-description" className="block text-sm font-medium text-gray-700 mb-1">Short description</label>
              <input id="new-hsn-description" value={description} maxLength={200} autoFocus={!!initial.code} className="input"
                placeholder="e.g. Medicaments in measured doses" onChange={(e) => { setDescription(e.target.value); setError(''); }} />
            </div>
            <div>
              <label htmlFor="new-hsn-gst" className="block text-sm font-medium text-gray-700 mb-1">Usual GST rate (optional)</label>
              <select id="new-hsn-gst" value={gst} onChange={(e) => setGst(e.target.value)} className="input">
                <option value="">— not sure —</option>
                {GST_SLABS.map((g) => <option key={g} value={String(g)}>{g}%</option>)}
              </select>
              <p className="text-xs text-gray-500 mt-1">Only a reminder: a product&apos;s own GST rate is never changed by it.</p>
            </div>
          </>
        )}
        {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-outline text-sm">Cancel</button>
          <button type="submit" disabled={create.isPending} className="btn-primary text-sm inline-flex items-center gap-1 disabled:opacity-50">
            {create.isPending && <Loader2 className="w-4 h-4 animate-spin" />} {existing && existing.description ? 'Choose it' : 'Add and choose'}
          </button>
        </div>
      </form>
    </Modal>,
    document.body,
  );
}
