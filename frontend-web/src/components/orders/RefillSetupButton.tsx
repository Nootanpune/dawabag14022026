'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Repeat } from 'lucide-react';
import { toast } from 'sonner';
import { createRefill, refillKeys } from '@/lib/refills';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { formatDate } from '@/lib/utils';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';
import FrequencySelect, { frequencyError } from '@/components/refills/FrequencySelect';
import RefillCopy from '@/components/refills/RefillCopy';

/** "Refill every…" on a delivered order — creates a refill subscription on the server. */
export default function RefillSetupButton({ orderId }: { orderId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState('30');
  const [error, setError] = useState('');
  const [created, setCreated] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => createRefill(orderId, Number(days)),
    onSuccess: (res) => {
      toast.success('Refill set up');
      setCreated(res.next_refill_date);
      setOpen(false);
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not set up refill')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: refillKeys.all }),
  });

  const submit = () => {
    const e = frequencyError(days);
    if (e) return setError(e);
    setError('');
    create.mutate();
  };

  return (
    <div className="card mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-sm">Need these again?</h3>
          <p className="text-xs text-gray-500">
            {created ? (
              <>
                Next refill on {formatDate(created)}.{' '}
                <Link href="/account/refills" className="text-brand-600 hover:underline">
                  Manage refills
                </Link>
              </>
            ) : (
              'Set up an automatic refill of this order.'
            )}
          </p>
        </div>
        <button onClick={() => setOpen(true)} className="btn-outline text-sm inline-flex items-center gap-2">
          <Repeat className="w-4 h-4" /> Refill every…
        </button>
      </div>
      {open && (
        <Modal title="Refill this order" onClose={() => setOpen(false)}>
          <label className="block text-sm font-medium text-gray-700 mb-1">How often?</label>
          <FrequencySelect value={days} onChange={setDays} />
          <div className="mt-3">
            <RefillCopy />
          </div>
          <DialogActions
            onCancel={() => setOpen(false)}
            onConfirm={submit}
            confirmLabel="Set up refill"
            pending={create.isPending}
            error={error}
          />
        </Modal>
      )}
    </div>
  );
}
