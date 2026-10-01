'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { LICENCE_TYPES, licenceKeys, saveLicence, type Licence, type LicenceInput, type LicenceType } from '@/lib/compliance/licences';
import { getApiErrorMessage } from '@/lib/apiErrors';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';

const TEXT_FIELDS = [
  { key: 'licence_number', label: 'Licence number' },
  { key: 'issued_by', label: 'Issued by (optional)' },
  { key: 'premises', label: 'Premises (optional)' },
  { key: 'renewal_owner', label: 'Renewal owner' },
  { key: 'renewal_owner_email', label: 'Renewal owner email (optional)' },
] as const;

const blankToNull = (v: string) => (v.trim() ? v.trim() : null);

/** Add or edit a licence in the register (C-07). */
export default function LicenceFormDialog({ licence, onClose }: { licence: Licence | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<LicenceType>(licence?.licence_type ?? 'retail_20');
  const [text, setText] = useState<Record<string, string>>({
    licence_number: licence?.licence_number ?? '',
    issued_by: licence?.issued_by ?? '',
    premises: licence?.premises ?? '',
    renewal_owner: licence?.renewal_owner ?? '',
    renewal_owner_email: licence?.renewal_owner_email ?? '',
    notes: licence?.notes ?? '',
    valid_from: licence?.valid_from?.slice(0, 10) ?? '',
    valid_upto: licence?.valid_upto?.slice(0, 10) ?? '',
  });
  const [active, setActive] = useState(licence?.is_active ?? true);
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: (body: LicenceInput) => saveLicence(body, licence?.id),
    onSuccess: () => {
      toast.success('Licence saved');
      onClose();
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not save the licence')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: licenceKeys.list }),
  });

  const submit = () => {
    if (text.licence_number.trim().length < 2) return setError('Enter the licence number');
    if (text.renewal_owner.trim().length < 2) return setError('Name who renews this licence');
    if (text.valid_from && text.valid_upto && text.valid_from > text.valid_upto) return setError('Valid from must be before valid up to');
    setError('');
    save.mutate({
      licence_type: type,
      licence_number: text.licence_number.trim(),
      issued_by: blankToNull(text.issued_by),
      premises: blankToNull(text.premises),
      valid_from: blankToNull(text.valid_from),
      valid_upto: blankToNull(text.valid_upto),
      renewal_owner: text.renewal_owner.trim(),
      renewal_owner_email: blankToNull(text.renewal_owner_email),
      notes: blankToNull(text.notes),
      is_active: active,
    });
  };

  return (
    <Modal title={licence ? 'Edit licence' : 'Add licence'} onClose={onClose} size="lg">
      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <label className="block sm:col-span-2">
          <span className="block font-medium text-gray-700 mb-1">Type</span>
          <select value={type} onChange={(e) => setType(e.target.value as LicenceType)} className="input">
            {LICENCE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        {TEXT_FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="block font-medium text-gray-700 mb-1">{f.label}</span>
            <input value={text[f.key]} onChange={(e) => setText({ ...text, [f.key]: e.target.value })} className="input" />
          </label>
        ))}
        {(['valid_from', 'valid_upto'] as const).map((k) => (
          <label key={k} className="block">
            <span className="block font-medium text-gray-700 mb-1">{k === 'valid_from' ? 'Valid from' : 'Valid up to (blank = no expiry)'}</span>
            <input type="date" value={text[k]} onChange={(e) => setText({ ...text, [k]: e.target.value })} className="input" />
          </label>
        ))}
        <label className="block sm:col-span-2">
          <span className="block font-medium text-gray-700 mb-1">Notes (optional)</span>
          <textarea value={text.notes} onChange={(e) => setText({ ...text, notes: e.target.value })} rows={2} className="input" />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active
        </label>
      </div>
      <DialogActions onCancel={onClose} onConfirm={submit} confirmLabel="Save" pending={save.isPending} error={error} />
    </Modal>
  );
}
