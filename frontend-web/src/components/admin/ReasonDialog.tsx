'use client';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import Modal from './Modal';

interface Props {
  title: string;
  label?: string;
  confirmLabel: string;
  minLength?: number;
  pending?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

/** Asks for a mandatory reason (reject / fail decisions). */
export default function ReasonDialog({
  title,
  label = 'Reason',
  confirmLabel,
  minLength = 5,
  pending,
  onClose,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const submit = () => {
    if (reason.trim().length < minLength) {
      setError(`Please enter at least ${minLength} characters`);
      return;
    }
    onConfirm(reason.trim());
  };

  return (
    <Modal title={title} onClose={onClose}>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <textarea
        value={reason}
        onChange={(e) => {
          setReason(e.target.value);
          setError('');
        }}
        rows={3}
        autoFocus
        className="input"
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="btn-outline text-sm">
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={pending}
          className="bg-red-600 text-white px-4 py-2 rounded-lg font-medium text-sm hover:bg-red-700 disabled:opacity-50 inline-flex items-center gap-2"
        >
          {pending && <Loader2 className="w-4 h-4 animate-spin" />}
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
