'use client';
import { useState } from 'react';
import { clearMatch } from '@/lib/recallAlerts/api';
import type { AlertLine, AlertMatch } from '@/lib/recallAlerts/types';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';
import { useAlertDecision } from './useAlertDecision';

interface Props {
  line: AlertLine;
  match: AlertMatch;
  onClose: () => void;
}

/** "Not this product": same batch number, different drug or maker — a note is required (C-28). */
export default function ClearMatchDialog({ line, match, onClose }: Props) {
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const clear = useAlertDecision((n: string) => clearMatch(match.id, n), {
    success: `${match.product_name} cleared for ${line.batch_number}`,
    onDone: onClose,
    onError: setError,
  });

  const submit = () => {
    if (notes.trim().length < 5) return setError('Say why this is not the product on the alert (at least 5 characters)');
    setError('');
    clear.mutate(notes.trim());
  };

  return (
    <Modal title="Not this product" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p className="text-gray-600">
          <span className="font-medium text-gray-900">{match.product_name}</span>
          {match.manufacturer ? ` (${match.manufacturer})` : ''} carries batch{' '}
          <span className="font-mono">{(match.batch_numbers ?? []).join(', ') || line.batch_number}</span>, but the alert names{' '}
          <span className="font-medium text-gray-900">{line.drug_name}</span>
          {line.manufacturer ? ` by ${line.manufacturer}` : ''}.
        </p>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Why is it not the product on the alert?</span>
          <textarea
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setError('');
            }}
            rows={3}
            maxLength={2000}
            autoFocus
            placeholder="e.g. Different drug and maker; the batch number coincides"
            className="input"
          />
        </label>
      </div>
      <DialogActions onCancel={onClose} onConfirm={submit} confirmLabel="Clear product" pending={clear.isPending} error={error} />
    </Modal>
  );
}
