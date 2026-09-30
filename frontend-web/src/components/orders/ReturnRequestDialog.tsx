'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createReturn, RETURN_REASONS, returnKeys, type ReturnReason } from '@/lib/returns/api';
import { orderKeys, type OrderDetail, type OrderShipmentDetail } from '@/lib/orders/api';
import { getApiErrorMessage } from '@/lib/apiErrors';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';

interface Props {
  order: OrderDetail;
  shipment: OrderShipmentDetail;
  onClose: () => void;
}

/**
 * Report a problem with a delivered shipment (C-37). The server checks the time
 * windows (damaged / wrong / missing soon after delivery, others within the
 * claim period) and answers 409 with the reason if it is too late.
 */
export default function ReturnRequestDialog({ order, shipment, onClose }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const lines = order.items.filter((i) => i.shipment_id === shipment.id);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<ReturnReason | ''>('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const send = useMutation({
    mutationFn: () =>
      createReturn({
        shipment_id: shipment.id,
        reason: reason as ReturnReason,
        description: description.trim(),
        items: Object.entries(qty)
          .filter(([, q]) => q > 0)
          .map(([order_item_id, quantity]) => ({ order_item_id, quantity })),
      }),
    onSuccess: (r) => {
      toast.success(`Return ${r.return_no} raised`);
      queryClient.invalidateQueries({ queryKey: orderKeys.one(order.id) });
      queryClient.invalidateQueries({ queryKey: returnKeys.all });
      router.push(`/account/returns/${r.id}`);
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not raise the return')),
  });

  const submit = () => {
    if (!reason) return setError('Choose what went wrong');
    if (!Object.values(qty).some((q) => q > 0)) return setError('Choose at least one item and quantity');
    if (description.trim().length < 10) return setError('Describe the problem (at least 10 characters)');
    setError('');
    send.mutate();
  };

  return (
    <Modal title="Report a problem / return" onClose={onClose} size="lg">
      <p className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2 mb-3">
        Damaged, wrong or missing items must be reported within 48 hours of delivery; expired, near-expiry, quality and
        recall issues within 30 days. Returned medicines are destroyed or sent back to the supplier — never resold.
      </p>
      <label className="block text-sm font-medium text-gray-700 mb-1">What went wrong?</label>
      <select value={reason} onChange={(e) => setReason(e.target.value as ReturnReason)} className="input mb-3">
        <option value="">Select…</option>
        {RETURN_REASONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      <p className="text-sm font-medium text-gray-700 mb-1">Items</p>
      <div className="space-y-2 mb-3">
        {lines.map((l) => (
          <label key={l.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex-1">{l.product_name}</span>
            <span className="text-xs text-gray-400">of {l.quantity}</span>
            <input
              type="number"
              min={0}
              max={l.quantity}
              value={qty[l.id] ?? 0}
              onChange={(e) => setQty({ ...qty, [l.id]: Math.max(0, Math.min(l.quantity, Number(e.target.value) || 0)) })}
              className="input w-20"
            />
          </label>
        ))}
        {!lines.length && <p className="text-xs text-gray-400">No items found for this shipment.</p>}
      </div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Describe the problem</label>
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000} className="input" />
      <DialogActions onCancel={onClose} onConfirm={submit} confirmLabel="Submit" pending={send.isPending} error={error} />
    </Modal>
  );
}
