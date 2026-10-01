'use client';
import { useState } from 'react';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';

/** Close a consultation in progress, with optional clinical notes. */
export default function EndConsultDialog({
  pending,
  error,
  onClose,
  onConfirm,
}: {
  pending: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: (notes: string) => void;
}) {
  const [notes, setNotes] = useState('');
  return (
    <Modal title="End consultation" onClose={onClose}>
      <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} maxLength={5000} className="input" />
      <p className="text-xs text-gray-500 mt-1">You can still issue the e-prescription after ending.</p>
      <DialogActions onCancel={onClose} onConfirm={() => onConfirm(notes.trim())} confirmLabel="End consultation" pending={pending} error={error} />
    </Modal>
  );
}
