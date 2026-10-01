'use client';
import { useState } from 'react';
import { REJECTION_CODES, type ListingForReview } from '@/lib/admin/listings';
import Modal from '../Modal';
import DialogActions from '../DialogActions';

interface Props {
  listing: ListingForReview;
  pending?: boolean;
  onClose: () => void;
  onConfirm: (body: { rejection_reason_code: string; rejection_details?: string }) => void;
}

export default function RejectListingDialog({ listing, pending, onClose, onConfirm }: Props) {
  const [code, setCode] = useState('');
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');

  const submit = () => {
    if (!code) return setError('Choose a rejection code');
    setError('');
    onConfirm({ rejection_reason_code: code, rejection_details: details.trim() || undefined });
  };

  return (
    <Modal title={`Reject ${listing.medicine_name}`} onClose={onClose}>
      <p className="text-xs text-gray-500 mb-3">{listing.partner_name}</p>
      <label className="block text-sm">
        <span className="block font-medium text-gray-700 mb-1">Rejection code</span>
        <select value={code} onChange={(e) => setCode(e.target.value)} className="input">
          <option value="">Select</option>
          {REJECTION_CODES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm mt-3">
        <span className="block font-medium text-gray-700 mb-1">Details for the partner</span>
        <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} maxLength={1000} className="input" />
      </label>
      <DialogActions onCancel={onClose} onConfirm={submit} confirmLabel="Reject listing" pending={pending} danger error={error} />
    </Modal>
  );
}
