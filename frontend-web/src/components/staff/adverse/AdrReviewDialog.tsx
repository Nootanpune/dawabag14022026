'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { adrKeys, fetchAdr, reviewAdr, type AdrStatus } from '@/lib/compliance/adverseEvents';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { useAuthStore } from '@/store/authStore';
import Modal from '@/components/admin/Modal';
import QueryState from '@/components/admin/QueryState';
import DialogActions from '@/components/admin/DialogActions';
import AdrDetailView from '@/components/adverse/AdrDetailView';

type Next = Exclude<AdrStatus, 'new'>;
const NEXT: { value: Next; label: string }[] = [
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'forwarded', label: 'Forwarded to PvPI' },
  { value: 'closed', label: 'Closed' },
];

/** Pharmacist review of a side-effect report; forwarding needs the PvPI reference (C-29). */
export default function AdrReviewDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const canReview = useAuthStore((s) => s.user?.role) === 'pharmacist_rx';
  const { data, isLoading, error } = useQuery({ queryKey: adrKeys.one(id), queryFn: () => fetchAdr(id) });
  const [status, setStatus] = useState<Next>('reviewed');
  const [notes, setNotes] = useState('');
  const [pvpi, setPvpi] = useState('');
  const [formError, setFormError] = useState('');

  const save = useMutation({
    mutationFn: () =>
      reviewAdr(id, { status, notes: notes.trim(), ...(pvpi.trim() ? { pvpi_reference: pvpi.trim() } : {}) }),
    onSuccess: () => {
      toast.success('Report updated');
      onClose();
    },
    onError: (err) => setFormError(getApiErrorMessage(err, 'Could not update the report')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: adrKeys.all }),
  });

  const submit = () => {
    if (notes.trim().length < 3) return setFormError('Enter notes (at least 3 characters)');
    if (status === 'forwarded' && pvpi.trim().length < 3) return setFormError('Enter the PvPI reference');
    setFormError('');
    save.mutate();
  };

  return (
    <Modal title="Side-effect report" onClose={onClose} size="lg">
      <QueryState isLoading={isLoading} error={error} isEmpty={false} emptyText="" />
      {data && <AdrDetailView r={data} />}
      {data && data.status !== 'closed' && canReview && (
        <div className="mt-4 space-y-3 text-sm">
          <div className="flex flex-wrap gap-4">
            {NEXT.map((n) => (
              <label key={n.value} className="flex items-center gap-2">
                <input type="radio" checked={status === n.value} onChange={() => setStatus(n.value)} /> {n.label}
              </label>
            ))}
          </div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Pharmacist notes" className="input" />
          {status === 'forwarded' && (
            <input value={pvpi} onChange={(e) => setPvpi(e.target.value)} placeholder="PvPI reference" maxLength={100} className="input font-mono" />
          )}
          <DialogActions onCancel={onClose} onConfirm={submit} confirmLabel="Save" pending={save.isPending} error={formError} />
        </div>
      )}
      {data && !canReview && <p className="text-xs text-gray-400 mt-3">Only a registered pharmacist can review reports.</p>}
    </Modal>
  );
}
