'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';
import { getApiErrorMessage } from '@/lib/apiErrors';
import {
  launchReadinessKey, MANUAL_STATUS_OPTIONS, updateManualItem, type ReadinessItem, type ReadinessStatus,
} from '@/lib/admin/launchReadiness';

/** Change the status and note of a manual checklist item; the server records it in the audit log (C-46). */
export default function ManualItemDialog({ item, onClose }: { item: ReadinessItem; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ReadinessStatus>(item.status);
  const [note, setNote] = useState(item.note ?? '');
  const save = useMutation({
    mutationFn: () => updateManualItem(item.key, { status, note: note.trim() || null }),
    onSuccess: () => {
      toast.success(`${item.ref} updated`);
      queryClient.invalidateQueries({ queryKey: launchReadinessKey });
      onClose();
    },
  });
  return (
    <Modal title={`Update ${item.ref}`} onClose={onClose} size="lg">
      <div className="space-y-3 text-sm">
        <p className="text-gray-800">{item.title}</p>
        <p className="text-xs text-gray-500">Who: {item.who}</p>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as ReadinessStatus)} className="input">
            {MANUAL_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Note (optional)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} className="input"
            placeholder="e.g. who confirmed it and when, or what is still missing" />
        </label>
        <p className="text-xs text-gray-500">The change is recorded in the audit log with your name.</p>
      </div>
      <DialogActions onCancel={onClose} onConfirm={() => save.mutate()} confirmLabel="Save" pending={save.isPending}
        error={save.isError ? getApiErrorMessage(save.error, 'Could not save') : undefined} />
    </Modal>
  );
}
