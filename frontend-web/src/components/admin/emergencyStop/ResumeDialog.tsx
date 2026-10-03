'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { emergencyKeys, resumeRxSales } from '@/lib/emergencyStop/api';
import { getApiErrorMessage } from '@/lib/apiErrors';
import Modal from '@/components/admin/Modal';

export default function ResumeDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState('');
  const resume = useMutation({
    mutationFn: () => resumeRxSales({ ...(note.trim() ? { note: note.trim() } : {}), confirm: 'RESUME' }),
    onSuccess: () => {
      toast.success('Prescription-medicine sales resumed');
      queryClient.invalidateQueries({ queryKey: emergencyKeys.admin });
      queryClient.invalidateQueries({ queryKey: emergencyKeys.public });
      onClose();
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Could not resume')),
  });
  return (
    <Modal title="Resume prescription-medicine sales" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p>Buyers can order prescription medicines again, and held parcels may be dispatched.</p>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Note (optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="input" />
        </label>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Type RESUME to confirm</span>
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} className="input" autoComplete="off" />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-outline text-sm">Cancel</button>
          <button type="button" disabled={confirm !== 'RESUME' || resume.isPending} onClick={() => resume.mutate()}
            className="btn-primary text-sm inline-flex items-center gap-2 disabled:opacity-50">
            {resume.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Resume sales
          </button>
        </div>
      </div>
    </Modal>
  );
}
