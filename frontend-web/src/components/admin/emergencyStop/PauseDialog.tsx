'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { emergencyKeys, pauseRxSales } from '@/lib/emergencyStop/api';
import { getApiErrorMessage } from '@/lib/apiErrors';
import Modal from '@/components/admin/Modal';

/** Two steps: the reason and reference, then typing PAUSE (the server checks it too). */
export default function PauseDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const pause = useMutation({
    mutationFn: () => pauseRxSales({ reason: reason.trim(), reference: reference.trim(), ...(message.trim() ? { public_message: message.trim() } : {}), confirm: 'PAUSE' }),
    onSuccess: () => {
      toast.success('Prescription-medicine sales paused');
      queryClient.invalidateQueries({ queryKey: emergencyKeys.admin });
      queryClient.invalidateQueries({ queryKey: emergencyKeys.public });
      onClose();
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Could not pause')),
  });
  const firstOk = reason.trim().length >= 10 && reference.trim().length >= 3 && (!message.trim() || message.trim().length >= 10);

  return (
    <Modal title="Pause prescription-medicine sales" onClose={onClose}>
      {step === 1 ? (
        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="block font-medium text-gray-700 mb-1">Reason (staff only, at least 10 characters)</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} className="input" />
          </label>
          <label className="block">
            <span className="block font-medium text-gray-700 mb-1">Reference, e.g. the notification number (shown to buyers)</span>
            <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} className="input" />
          </label>
          <label className="block">
            <span className="block font-medium text-gray-700 mb-1">Message for buyers (optional)</span>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} maxLength={300} className="input"
              placeholder="Orders for prescription medicines are paused for now. You can still order other products." />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-outline text-sm">Cancel</button>
            <button type="button" disabled={!firstOk} onClick={() => setStep(2)} className="btn-primary text-sm disabled:opacity-50">Next</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <p>
            This stops every retail buyer from ordering Schedule H / H1 medicines from Dawabag and all partners, and holds paid
            parcels holding them at dispatch, until you resume.
          </p>
          <label className="block">
            <span className="block font-medium text-gray-700 mb-1">Type PAUSE to confirm</span>
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} className="input" autoComplete="off" />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setStep(1)} className="btn-outline text-sm">Back</button>
            <button type="button" disabled={confirm !== 'PAUSE' || pause.isPending} onClick={() => pause.mutate()}
              className="text-sm inline-flex items-center gap-2 rounded-full px-4 py-2 font-medium text-white bg-red-700 hover:bg-red-800 disabled:opacity-50">
              {pause.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Pause sales now
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
