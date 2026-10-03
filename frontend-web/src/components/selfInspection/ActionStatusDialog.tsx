'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Modal from '@/components/admin/Modal';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { ACTION_LABELS, changeAction, siKeys, type ActionStatus, type CorrectiveAction } from '@/lib/selfInspection/api';

const NEXT: Record<ActionStatus, ActionStatus[]> = { open: ['in_progress', 'closed'], in_progress: ['open', 'closed'], closed: [] };

/** Move a corrective action on (owner or admin); every step is kept in its history (C-34). */
export default function ActionStatusDialog({ action, onClose }: { action: CorrectiveAction; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [to, setTo] = useState<ActionStatus>(NEXT[action.status][0] ?? 'closed');
  const [note, setNote] = useState('');
  const problem = to === 'closed' && note.trim().length < 5 ? 'Say how it was put right (close-out note).' : null;
  const save = useMutation({
    mutationFn: () => changeAction(action.id, to, note.trim() || null),
    onSuccess: () => { toast.success(`${action.action_no}: ${ACTION_LABELS[to]}`); queryClient.invalidateQueries({ queryKey: siKeys.all }); onClose(); },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Could not update the action')),
  });
  return (
    <Modal title={`Corrective action ${action.action_no}`} onClose={onClose}>
      <p className="text-sm text-gray-700 mb-3">{action.description}</p>
      <label className="block text-sm mb-3"><span className="block font-medium text-gray-700 mb-1">New status</span>
        <select className="input" value={to} onChange={(e) => setTo(e.target.value as ActionStatus)}>
          {NEXT[action.status].map((s) => <option key={s} value={s}>{ACTION_LABELS[s]}</option>)}
        </select>
      </label>
      <label className="block text-sm"><span className="block font-medium text-gray-700 mb-1">{to === 'closed' ? 'Close-out note' : 'Note (optional)'}</span>
        <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {problem && <p className="text-xs text-amber-800 mt-2" role="status">{problem}</p>}
      <div className="flex justify-end gap-2 mt-4">
        <button type="button" onClick={onClose} className="btn-outline text-sm">Cancel</button>
        <button type="button" disabled={!!problem || save.isPending} onClick={() => save.mutate()} className="btn-primary text-sm disabled:opacity-50">Save</button>
      </div>
    </Modal>
  );
}
