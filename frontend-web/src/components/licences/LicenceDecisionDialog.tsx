'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { decideLicence } from '@/lib/licences/api';
import type { LicenceView } from '@/lib/licences/forms';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { todayIST } from '@/lib/dates';
import Modal from '../admin/Modal';
import DialogActions from '../admin/DialogActions';

interface Props {
  licence: Pick<LicenceView, 'id' | 'label' | 'licence_number' | 'valid_upto' | 'issued_by'>;
  partyName?: string | null;
  onClose: () => void;
  /** query keys to refresh after the decision */
  refresh: readonly (readonly unknown[])[];
}

/**
 * An admin checks one licence against the licensing authority's record: verify with the
 * valid-till date printed on it, or say why it is not accepted (the holder sees the reason).
 * A verified renewal replaces the licence of the same form (C-07, C-11, C-33).
 */
export default function LicenceDecisionDialog({ licence, partyName, onClose, refresh }: Props) {
  const qc = useQueryClient();
  const [validUpto, setValidUpto] = useState(licence.valid_upto ?? '');
  const [issuedBy, setIssuedBy] = useState(licence.issued_by ?? '');
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState<'verify' | 'reject'>('verify');
  const [error, setError] = useState('');
  const today = todayIST();
  const decide = useMutation({
    mutationFn: () => decideLicence(licence.id!, mode === 'verify'
      ? { verified: true, valid_upto: validUpto, issued_by: issuedBy.trim() || null }
      : { verified: false, reason: reason.trim() }),
    onSuccess: (r) => {
      toast.success(r.account_activated ? 'Licence verified — account is active' : mode === 'verify' ? 'Licence verified' : 'Licence not accepted');
      refresh.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      onClose();
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not save the decision')),
  });
  const confirm = () => {
    if (mode === 'verify' && !validUpto) return setError('Enter the valid-till date printed on the licence');
    if (mode === 'verify' && validUpto < today) return setError('This date has passed — an expired licence cannot be verified');
    if (mode === 'reject' && reason.trim().length < 3) return setError('Give the reason (the holder sees it)');
    setError('');
    decide.mutate();
  };
  return (
    <Modal title={`Check ${licence.label} ${licence.licence_number}`} onClose={onClose}>
      <div className="space-y-3 text-sm">
        {partyName && <p className="text-gray-600">{partyName}</p>}
        <div className="flex gap-4" role="radiogroup" aria-label="Decision">
          <label className="inline-flex items-center gap-1.5">
            <input type="radio" checked={mode === 'verify'} onChange={() => setMode('verify')} /> Verified on the authority&apos;s record
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input type="radio" checked={mode === 'reject'} onChange={() => setMode('reject')} /> Not accepted
          </label>
        </div>
        {mode === 'verify' ? (
          <>
            <label className="block">
              <span className="block font-medium text-gray-700 mb-1">Valid till (as printed)</span>
              <input type="date" value={validUpto} min={today} onChange={(e) => setValidUpto(e.target.value)} className="input" />
            </label>
            <label className="block">
              <span className="block font-medium text-gray-700 mb-1">Issued by (optional)</span>
              <input value={issuedBy} onChange={(e) => setIssuedBy(e.target.value)} className="input" maxLength={200} />
            </label>
          </>
        ) : (
          <label className="block">
            <span className="block font-medium text-gray-700 mb-1">Reason (shown to the holder)</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} className="input" rows={3} maxLength={500} />
          </label>
        )}
      </div>
      <DialogActions onCancel={onClose} onConfirm={confirm} confirmLabel={mode === 'verify' ? 'Verify licence' : 'Mark not accepted'}
        pending={decide.isPending} danger={mode === 'reject'} error={error} />
    </Modal>
  );
}
