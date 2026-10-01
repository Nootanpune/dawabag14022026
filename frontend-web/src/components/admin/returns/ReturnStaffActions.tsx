'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { closeReturn, decideReturn, DISPOSITIONS, returnKeys, type Disposition, type ReturnDetail } from '@/lib/returns/api';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { hasRole, RETURN_DECIDE_ROLES } from '@/lib/admin/roles';
import { formatPrice } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';

/**
 * Approve / reject (admin, pharmacist_rx) and record disposition (any returns
 * staff). Approval issues the credit note and refund on the server (C-37).
 */
export default function ReturnStaffActions({ r }: { r: ReturnDetail }) {
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const [deciding, setDeciding] = useState<boolean | null>(null);
  const [notes, setNotes] = useState('');
  const [closing, setClosing] = useState(false);
  const [disposition, setDisposition] = useState<Disposition>('destroyed');
  const [error, setError] = useState('');
  const refresh = () => queryClient.invalidateQueries({ queryKey: returnKeys.all });

  const decide = useMutation({
    mutationFn: (approve: boolean) => decideReturn(r.id, approve, notes.trim()),
    onSuccess: (res) => {
      toast.success(
        res.status === 'approved'
          ? `Approved · refund ${formatPrice(res.refund_paise)}${res.credit_note_number ? ` · ${res.credit_note_number}` : ''}`
          : 'Return rejected'
      );
      setDeciding(null);
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not record the decision')),
    onSettled: refresh,
  });

  const close = useMutation({
    mutationFn: () => closeReturn(r.id, disposition),
    onSuccess: () => {
      toast.success('Return closed');
      setClosing(false);
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not close the return')),
    onSettled: refresh,
  });

  const canDecide = r.status === 'requested' && hasRole(role, RETURN_DECIDE_ROLES);
  if (!canDecide && r.status !== 'approved') return null;

  return (
    <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-gray-100">
      {canDecide && (
        <>
          <button onClick={() => { setError(''); setDeciding(true); }} className="btn-primary text-sm">Approve</button>
          <button onClick={() => { setError(''); setDeciding(false); }} className="btn-outline text-sm text-red-600">Reject</button>
        </>
      )}
      {r.status === 'approved' && (
        <button onClick={() => { setError(''); setClosing(true); }} className="btn-outline text-sm">
          Record disposition & close
        </button>
      )}
      {deciding !== null && (
        <Modal title={deciding ? 'Approve return' : 'Reject return'} onClose={() => setDeciding(null)}>
          {deciding && (
            <p className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2 mb-3">
              Approving issues a credit note in the seller&apos;s series and refunds the buyer. Partner returns are deducted from the
              next settlement.
            </p>
          )}
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes (shown to the buyer)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="input" autoFocus />
          <DialogActions
            onCancel={() => setDeciding(null)}
            onConfirm={() => (notes.trim().length < 3 ? setError('Enter at least 3 characters') : decide.mutate(deciding))}
            confirmLabel={deciding ? 'Approve & refund' : 'Reject'}
            danger={!deciding}
            pending={decide.isPending}
            error={error}
          />
        </Modal>
      )}
      {closing && (
        <Modal title="Record disposition" onClose={() => setClosing(false)}>
          <p className="text-xs text-gray-600 mb-3">Returned medicines are never put back into stock.</p>
          <div className="space-y-2 text-sm">
            {DISPOSITIONS.map((d) => (
              <label key={d.value} className="flex items-center gap-2">
                <input type="radio" checked={disposition === d.value} onChange={() => setDisposition(d.value)} />
                {d.label}
              </label>
            ))}
          </div>
          <DialogActions
            onCancel={() => setClosing(false)}
            onConfirm={() => close.mutate()}
            confirmLabel="Close return"
            pending={close.isPending}
            error={error}
          />
        </Modal>
      )}
    </div>
  );
}
