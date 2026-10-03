'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Modal from '@/components/admin/Modal';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { toISTDateString } from '@/lib/dates';
import { changeProblems, onlineSaleKeys, setOnlineSale, type OnlineSaleChange } from '@/lib/onlineSale/api';
import OnlineSaleFields from './OnlineSaleFields';

/** Set the online-sale status of one or many products (Sprint 39, C-10). */
export default function ChangeDialog({ products, canAllow, onClose }: { products: { id: string; name: string }[]; canAllow: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState<OnlineSaleChange>({ status: canAllow ? 'permitted' : 'restricted', notification_ref: '', notification_date: '', reason: '' });
  const problem = changeProblems(value, canAllow, toISTDateString(Date.now()));
  const save = useMutation({
    mutationFn: () => setOnlineSale(products.map((p) => p.id), {
      status: value.status, notification_ref: value.notification_ref?.trim() || null,
      notification_date: value.notification_date || null, reason: value.reason?.trim() || null,
    }),
    onSuccess: (r) => {
      toast.success(`Online-sale status set for ${r.updated} product${r.updated === 1 ? '' : 's'}`);
      queryClient.invalidateQueries({ queryKey: onlineSaleKeys.all });
      queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
      onClose();
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Could not set the online-sale status')),
  });
  return (
    <Modal title={products.length === 1 ? `Online sale: ${products[0].name}` : `Online sale: ${products.length} products`} onClose={onClose} size="lg">
      <OnlineSaleFields value={value} onChange={setValue} canAllow={canAllow} idPrefix="osc" />
      <p className="text-xs text-gray-600 mt-2">
        A product that is not allowed stops selling at once — from Dawabag&apos;s stock and every partner&apos;s. Partners listing it are told.
        Schedule X and NDPS can never be allowed. Every change is recorded with who made it.
      </p>
      {problem && <p className="text-xs text-amber-800 mt-2" role="status">{problem}</p>}
      <div className="flex justify-end gap-2 mt-4">
        <button type="button" onClick={onClose} className="btn-outline text-sm">Cancel</button>
        <button type="button" disabled={!!problem || save.isPending} onClick={() => save.mutate()} className="btn-primary text-sm disabled:opacity-50">
          Save
        </button>
      </div>
    </Modal>
  );
}
