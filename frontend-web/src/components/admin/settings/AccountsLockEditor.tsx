'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { settingsKeys, updateSetting } from '@/lib/admin/settings';
import { ACCOUNTS_LOCK_KEY, latestLockableDate, lockDateError, lockedUntil } from '@/lib/admin/accountsLock';
import { getApiErrorMessage } from '@/lib/apiErrors';
import Modal from '../Modal';
import DialogActions from '../DialogActions';
import { formatDateIST } from '@/lib/dates';

/**
 * Set or clear the GST period lock (C-31). Choose a date, then confirm: saving
 * changes which purchase documents the server accepts.
 */
export default function AccountsLockEditor({ value, onClose }: { value: unknown; onClose: () => void }) {
  const queryClient = useQueryClient();
  const current = lockedUntil(value);
  const [date, setDate] = useState(current ?? '');
  // The value waiting for confirmation: a date, null (open the period), or undefined (still choosing)
  const [pending, setPending] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: (v: string | null) => updateSetting(ACCOUNTS_LOCK_KEY, v),
    onSuccess: (_r, v) => {
      toast.success(v ? `GST period locked up to ${formatDateIST(v)}` : 'GST period lock cleared');
      onClose();
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not update the lock')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: settingsKeys.all }),
  });

  const review = (v: string | null) => {
    const e = v === null ? '' : lockDateError(v);
    if (e) return setError(e);
    setError('');
    setPending(v);
  };

  if (pending !== undefined) {
    return (
      <Modal title={pending ? 'Lock the GST period?' : 'Clear the GST period lock?'} onClose={onClose}>
        <p className="text-sm text-gray-600">
          {pending
            ? `Purchase entries and supplier credit notes dated on or before ${formatDateIST(pending)} will be refused. Lock only periods whose GST returns are already filed.`
            : 'Purchase entries and supplier credit notes of any date will be accepted again, including periods whose returns may already be filed.'}
        </p>
        <DialogActions
          onCancel={() => setPending(undefined)}
          onConfirm={() => save.mutate(pending)}
          confirmLabel={pending ? 'Lock period' : 'Clear lock'}
          danger={!pending}
          pending={save.isPending}
          error={error}
        />
      </Modal>
    );
  }

  return (
    <Modal title="GST period locked up to" onClose={onClose}>
      <label className="block text-sm">
        <span className="block font-medium text-gray-700 mb-1">GST period locked up to</span>
        <input type="date" value={date} max={latestLockableDate()} onChange={(e) => setDate(e.target.value)} className="input w-48" />
        <span className="block text-xs text-gray-500 mt-1">
          Purchase entries and supplier credit notes dated on or before this date are refused (returns already filed). Only a past date can be
          locked.
        </span>
      </label>
      {current && (
        <button type="button" onClick={() => review(null)} className="text-xs text-red-600 hover:underline mt-4">
          Clear the lock
        </button>
      )}
      <DialogActions onCancel={onClose} onConfirm={() => review(date)} confirmLabel="Review" error={error} />
    </Modal>
  );
}
