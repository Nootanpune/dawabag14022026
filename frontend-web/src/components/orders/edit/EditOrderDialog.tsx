'use client';
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Minus, Plus, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import Modal from '@/components/admin/Modal';
import { editOrder, orderKeys, type OrderDetail } from '@/lib/orders/api';
import { getApiErrorMessage } from '@/lib/apiErrors';

/**
 * Lower quantities or remove lines before packing (Sprint 43, URS-074). Only lowering here:
 * to get more, the buyer places a new order. The server issues the credit note and refund.
 */
export default function EditOrderDialog({ order, onClose }: { order: OrderDetail; onClose: () => void }) {
  const queryClient = useQueryClient();
  const lines = order.items.filter((i) => (i.supply_qty ?? i.quantity) > 0);
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(lines.map((i) => [i.id, i.supply_qty ?? i.quantity])));
  const changes = useMemo(
    () => lines.filter((i) => qty[i.id] !== (i.supply_qty ?? i.quantity)).map((i) => ({ order_item_id: i.id, quantity: qty[i.id] })),
    [lines, qty]);
  const left = lines.reduce((s, i) => s + (qty[i.id] ?? 0), 0);

  const save = useMutation({
    mutationFn: () => editOrder(order.id, changes),
    onSuccess: (r) => { toast.success(r.message); onClose(); },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not change the order')),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: orderKeys.one(order.id) });
      queryClient.invalidateQueries({ queryKey: orderKeys.mine });
    },
  });

  const set = (id: string, n: number) => setQty((q) => ({ ...q, [id]: n }));

  return (
    <Modal title="Change this order" onClose={onClose}>
      <p className="text-sm text-gray-600 mb-3">
        Lower a quantity or remove a medicine. To add something, place a new order.
      </p>
      <ul className="divide-y divide-gray-100 mb-3">
        {lines.map((i) => {
          const was = i.supply_qty ?? i.quantity;
          const n = qty[i.id];
          return (
            <li key={i.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{i.product_name}</p>
                <p className="text-xs text-gray-500">{n === 0 ? 'Will be removed' : n < was ? `Was ${was}` : `Ordered ${was}`}</p>
              </div>
              <div className="flex items-center gap-2">
                <div role="group" aria-label={`Quantity of ${i.product_name}`} className="inline-flex items-center rounded-lg border-2 border-brand-600 overflow-hidden">
                  <button type="button" className="w-9 h-9 flex items-center justify-center text-brand-700 hover:bg-brand-50 disabled:opacity-40"
                    onClick={() => set(i.id, Math.max(0, n - 1))} disabled={n === 0} aria-label={`Lower quantity of ${i.product_name}`}>
                    <Minus className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <span className="min-w-8 text-center font-semibold tabular-nums" data-testid={`edit-qty-${i.id}`}>{n}</span>
                  <button type="button" className="w-9 h-9 flex items-center justify-center text-brand-700 hover:bg-brand-50 disabled:opacity-40"
                    onClick={() => set(i.id, Math.min(was, n + 1))} disabled={n >= was} aria-label={`Raise quantity of ${i.product_name} back`}>
                    <Plus className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
                {n > 0 ? (
                  <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => set(i.id, 0)}>Remove</button>
                ) : (
                  <button type="button" className="text-xs text-brand-700 hover:underline inline-flex items-center gap-1" onClick={() => set(i.id, was)}>
                    <Undo2 className="w-3 h-3" aria-hidden="true" /> Keep
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {left === 0 && <p className="text-sm text-red-600 mb-2">To remove everything, cancel the order instead.</p>}
      <p className="text-xs text-gray-500 mb-4">
        The invoice stays as issued; what you take off gets a credit note and the money for it comes back the way you paid.
        If your payment is only held for the pharmacist&apos;s check, the held amount is taken after the check and the difference is refunded at once.
        The delivery charge does not change.
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-outline text-sm" onClick={onClose}>Back</button>
        <button type="button" className="btn-primary text-sm" disabled={!changes.length || left === 0 || save.isPending} onClick={() => save.mutate()}>
          {save.isPending && <Loader2 className="w-4 h-4 animate-spin inline mr-1" aria-hidden="true" />}
          Save changes
        </button>
      </div>
    </Modal>
  );
}
