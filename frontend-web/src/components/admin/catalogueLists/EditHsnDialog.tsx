'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';
import type { HsnCode } from '@/lib/catalogueLists';
import { GST_SLABS, HSN_RE, tidyHsn, tidyName } from '@/lib/catalogueLists';
import { updateHsnCode, usedByText } from '@/lib/admin/catalogueListsAdmin';
import { getApiErrorMessage } from '@/lib/apiErrors';

/**
 * Edit an HSN entry. A code used by products keeps its number (they and their invoices
 * carry it): only its description and usual GST rate change. An unused code can be
 * corrected. The GST rate here is a hint — no product's GST is changed.
 */
export default function EditHsnDialog({ hsn, onClose, onDone }: { hsn: HsnCode; onClose: () => void; onDone: (msg: string) => void }) {
  const qc = useQueryClient();
  const locked = hsn.product_count > 0;
  const [code, setCode] = useState(hsn.code);
  const [description, setDescription] = useState(hsn.description ?? '');
  const [gst, setGst] = useState<string>(hsn.gst_rate == null ? '' : String(hsn.gst_rate));
  const [error, setError] = useState('');
  const save = useMutation({
    mutationFn: () => updateHsnCode(hsn.code, {
      ...(tidyHsn(code) !== hsn.code ? { code: tidyHsn(code) } : {}),
      description: tidyName(description),
      gst_rate: gst === '' ? null : Number(gst),
    }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['catalogue-lists'] }); onDone(`HSN ${r.hsn.code} saved`); },
    onError: (e) => setError(getApiErrorMessage(e, 'Could not save the HSN code')),
  });
  const submit = () => {
    if (!locked && !HSN_RE.test(tidyHsn(code))) { setError('The HSN code must be 4, 6 or 8 digits'); return; }
    if (tidyName(description).length < 3) { setError('Add a short description (what goods the code covers)'); return; }
    setError('');
    save.mutate();
  };
  return (
    <Modal title={`Edit HSN ${hsn.code}`} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-3">
        <div>
          <label htmlFor="hsn-code" className="block text-sm font-medium text-gray-700 mb-1">HSN code</label>
          <input id="hsn-code" className="input w-full" inputMode="numeric" value={code} disabled={locked} maxLength={12}
            onChange={(e) => setCode(e.target.value)} aria-describedby="hsn-code-note" />
          <p id="hsn-code-note" className="text-xs text-gray-500 mt-1">
            {locked
              ? `${usedByText(hsn.product_count)}, so the code cannot be changed. If it is wrong, add the right code as a new entry and move the products to it.`
              : 'Not used by any product yet, so a wrongly typed code can be corrected.'}
          </p>
        </div>
        <div>
          <label htmlFor="hsn-description" className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <input id="hsn-description" className="input w-full" value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label htmlFor="hsn-gst" className="block text-sm font-medium text-gray-700 mb-1">Usual GST rate</label>
          <select id="hsn-gst" className="input w-full" value={gst} onChange={(e) => setGst(e.target.value)}>
            <option value="">Not set</option>
            {GST_SLABS.map((g) => <option key={g} value={g}>{g}%</option>)}
          </select>
          <p className="text-xs text-gray-500 mt-1">A hint shown on product forms. No product&apos;s GST rate is changed.</p>
        </div>
        <DialogActions onCancel={onClose} onConfirm={submit} confirmLabel="Save" pending={save.isPending} error={error} />
      </form>
    </Modal>
  );
}
