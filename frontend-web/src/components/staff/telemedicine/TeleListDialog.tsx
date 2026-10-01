'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';
import { setTelemedicineList } from '@/lib/telemedicine/adminApi';
import { TELE_LIST_LABELS, TELE_LISTS, teleListShort } from '@/lib/telemedicine/labels';
import type { TeleList } from '@/lib/telemedicine/types';
import type { AdminProductRow } from '@/lib/admin/products';
import { isNeverStocked } from '@/lib/purchasing/productSearch';
import { getApiErrorMessage } from '@/lib/apiErrors';

/** Pharmacist classifies a medicine under the Telemedicine Practice Guidelines (C-23). Audited on the server. */
export default function TeleListDialog({ p, onClose }: { p: AdminProductRow; onClose: () => void }) {
  const queryClient = useQueryClient();
  const forced = isNeverStocked(p.drug_schedule);
  const [list, setList] = useState<TeleList>(forced ? 'prohibited' : p.telemedicine_list ?? 'O');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const save = useMutation({
    mutationFn: () => setTelemedicineList(p.id, list, notes.trim()),
    onSuccess: (r) => {
      toast.success(`${p.name}: ${teleListShort(r.telemedicine_list)}`);
      onClose();
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not save the list')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'products'] }),
  });
  const confirm = () => {
    const n = notes.trim().length;
    if (n < 3 || n > 500) return setError('Notes: 3 to 500 characters');
    save.mutate();
  };
  return (
    <Modal title="Telemedicine list" onClose={onClose}>
      <p className="text-sm font-medium">{p.name}</p>
      <p className="text-xs text-gray-500 mb-3">
        {p.sku} · {p.drug_schedule ?? 'OTC'} · now {teleListShort(p.telemedicine_list)}
      </p>
      <fieldset className="space-y-1.5 text-sm mb-3">
        {TELE_LISTS.map((l) => (
          <label key={l} className="flex items-start gap-2">
            <input type="radio" name="tele-list" checked={list === l} disabled={forced && l !== 'prohibited'} onChange={() => setList(l)} className="mt-0.5" />
            <span>{TELE_LIST_LABELS[l]}</span>
          </label>
        ))}
      </fieldset>
      {forced && <p className="text-xs text-amber-700 mb-2">Schedule X and NDPS medicines are always prohibited.</p>}
      <label className="block text-sm font-medium text-gray-700 mb-1">Notes (reason, guideline reference)</label>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={500} className="input" />
      <DialogActions onCancel={onClose} onConfirm={confirm} confirmLabel="Save" pending={save.isPending} error={error} />
    </Modal>
  );
}
