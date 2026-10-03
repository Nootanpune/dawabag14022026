'use client';
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Minus, Plus, Trash2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import Modal from '@/components/admin/Modal';
import { editOrder, orderKeys, type OrderDetail } from '@/lib/orders/api';
import { getApiErrorMessage } from '@/lib/apiErrors';
import type { SearchProduct } from '@/lib/search/api';
import { formatPrice } from '@/lib/utils';
import WrittenOrderPicker from '@/components/practitioner/WrittenOrderPicker';
import AddMedicineSearch from './AddMedicineSearch';
import EditRxPicker from './EditRxPicker';

const RX = ['Schedule H', 'Schedule H1'];
const TRADE = ['b2b_retailer', 'b2b_wholesaler', 'doc_hospital'];
const MAX_QTY = 999;

/**
 * Change the order before our pharmacist approves it (Sprint 44, owner decision 2026-10-03):
 * lower, remove or raise quantities and add medicines. A prescription medicine added or raised
 * needs a valid prescription (C-08); a doctor / institution signs a written order for what is
 * added (r.65(9)(b)). The server re-prices the order and settles the difference: a refund, or a
 * second payment for the extra (shown on the order page).
 */
export default function EditOrderDialog({ order, onClose }: { order: OrderDetail; onClose: () => void }) {
  const queryClient = useQueryClient();
  const lines = order.items.filter((i) => (i.supply_qty ?? i.quantity) > 0);
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(lines.map((i) => [i.id, i.supply_qty ?? i.quantity])));
  const [adds, setAdds] = useState<{ product: SearchProduct; quantity: number }[]>([]);
  const [rxId, setRxId] = useState<string | null>(null);
  const [writtenOrderId, setWrittenOrderId] = useState<string | null>(null);
  const [rxAsked, setRxAsked] = useState(false);
  const trade = TRADE.includes(order.pricing_type ?? '');
  const practitioner = order.pricing_type === 'doc_hospital';

  const changes = useMemo(
    () => lines.filter((i) => qty[i.id] !== (i.supply_qty ?? i.quantity)).map((i) => ({ order_item_id: i.id, quantity: qty[i.id] })),
    [lines, qty]);
  const raised = lines.filter((i) => qty[i.id] > (i.supply_qty ?? i.quantity));
  const left = lines.reduce((s, i) => s + (qty[i.id] ?? 0), 0) + adds.reduce((s, a) => s + a.quantity, 0);
  // Which additions need a prescription for this buyer (the server decides; this only asks early)
  const rxNames = [
    ...raised.filter((i) => RX.includes(i.drug_schedule ?? '')).map((i) => i.product_name),
    ...adds.filter((a) => RX.includes(a.product.drug_schedule)).map((a) => a.product.name),
  ];
  const needsRx = (!trade && rxNames.length > 0) || rxAsked;
  const more = [
    ...raised.map((i) => ({ product_id: i.product_id, quantity: qty[i.id] })),
    ...adds.map((a) => ({ product_id: a.product.id, quantity: a.quantity })),
  ];
  const needsWritten = practitioner && more.length > 0;

  const save = useMutation({
    mutationFn: () => editOrder(order.id, {
      lines: changes, add: adds.map((a) => ({ product_id: a.product.id, quantity: a.quantity })),
      ...(needsRx && rxId ? { prescription_id: rxId } : {}),
      ...(needsWritten && writtenOrderId ? { written_order_id: writtenOrderId } : {}),
    }),
    onSuccess: (r) => { toast.success(r.message); onClose(); },
    onError: (err: any) => {
      // The server asks for a prescription we did not expect: show the picker
      if (err?.response?.data?.code === 'PRESCRIPTION_REQUIRED') setRxAsked(true);
      toast.error(getApiErrorMessage(err, 'Could not change the order'));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: orderKeys.one(order.id) });
      queryClient.invalidateQueries({ queryKey: orderKeys.mine });
    },
  });

  const set = (id: string, n: number) => setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(MAX_QTY, n)) }));
  const nothing = !changes.length && !adds.length;
  const blocked = nothing || left === 0 || (needsRx && !rxId) || (needsWritten && !writtenOrderId) || save.isPending;

  return (
    <Modal title="Change this order" onClose={onClose} size="lg">
      <p className="text-sm text-gray-600 mb-3">
        Until our pharmacist approves the order you can lower, remove or raise a quantity, or add a medicine.
      </p>
      <ul className="divide-y divide-gray-100 mb-3">
        {lines.map((i) => {
          const was = i.supply_qty ?? i.quantity;
          const n = qty[i.id];
          return (
            <li key={i.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{i.product_name}</p>
                <p className="text-xs text-gray-500">{n === 0 ? 'Will be removed' : n !== was ? `Was ${was}` : `Ordered ${was}`}</p>
              </div>
              <div className="flex items-center gap-2">
                <div role="group" aria-label={`Quantity of ${i.product_name}`} className="inline-flex items-center rounded-lg border-2 border-brand-600 overflow-hidden">
                  <button type="button" className="w-9 h-9 flex items-center justify-center text-brand-700 hover:bg-brand-50 disabled:opacity-40"
                    onClick={() => set(i.id, n - 1)} disabled={n === 0} aria-label={`Lower quantity of ${i.product_name}`}>
                    <Minus className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <span className="min-w-8 text-center font-semibold tabular-nums" data-testid={`edit-qty-${i.id}`}>{n}</span>
                  <button type="button" className="w-9 h-9 flex items-center justify-center text-brand-700 hover:bg-brand-50 disabled:opacity-40"
                    onClick={() => set(i.id, n + 1)} disabled={n >= MAX_QTY} aria-label={`Raise quantity of ${i.product_name}`}>
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
        {adds.map((a) => (
          <li key={a.product.id} className="py-2 flex flex-wrap items-center justify-between gap-2" data-testid="edit-added">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{a.product.name}</p>
              <p className="text-xs text-gray-500">Added · {formatPrice(a.product.display_price_paise)} each</p>
            </div>
            <div className="flex items-center gap-2">
              <div role="group" aria-label={`Quantity of ${a.product.name}`} className="inline-flex items-center rounded-lg border-2 border-brand-600 overflow-hidden">
                <button type="button" className="w-9 h-9 flex items-center justify-center text-brand-700 disabled:opacity-40" disabled={a.quantity <= 1}
                  onClick={() => setAdds((x) => x.map((y) => (y.product.id === a.product.id ? { ...y, quantity: y.quantity - 1 } : y)))}
                  aria-label={`Lower quantity of ${a.product.name}`}><Minus className="w-4 h-4" aria-hidden="true" /></button>
                <span className="min-w-8 text-center font-semibold tabular-nums">{a.quantity}</span>
                <button type="button" className="w-9 h-9 flex items-center justify-center text-brand-700 disabled:opacity-40" disabled={a.quantity >= MAX_QTY}
                  onClick={() => setAdds((x) => x.map((y) => (y.product.id === a.product.id ? { ...y, quantity: y.quantity + 1 } : y)))}
                  aria-label={`Raise quantity of ${a.product.name}`}><Plus className="w-4 h-4" aria-hidden="true" /></button>
              </div>
              <button type="button" className="text-xs text-red-600 hover:underline inline-flex items-center gap-1"
                onClick={() => setAdds((x) => x.filter((y) => y.product.id !== a.product.id))}>
                <Trash2 className="w-3 h-3" aria-hidden="true" /> Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="mb-3">
        <AddMedicineSearch exclude={[...lines.map((i) => i.product_id), ...adds.map((a) => a.product.id)]} pincode={order.pincode}
          onAdd={(p) => setAdds((x) => [...x, { product: p, quantity: 1 }])} />
      </div>
      {needsRx && <div className="mb-3"><EditRxPicker orderId={order.id} names={rxNames.length ? rxNames : ['the medicines you added']} value={rxId} onChange={setRxId} /></div>}
      {needsWritten && <div className="mb-3"><WrittenOrderPicker items={more} value={writtenOrderId} onChange={setWrittenOrderId} /></div>}
      {left === 0 && <p className="text-sm text-red-600 mb-2">To remove everything, cancel the order instead.</p>}
      <p className="text-xs text-gray-500 mb-4">
        No invoice has been issued yet, so the order is simply re-priced. If it costs less, the difference comes back the way you paid
        (if your payment is only held for the pharmacist&apos;s check, the held amount is taken after the check and the difference refunded at once).
        If it costs more, you pay the difference before our pharmacist approves the order. The delivery charge does not change.
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-outline text-sm" onClick={onClose}>Back</button>
        <button type="button" className="btn-primary text-sm" disabled={blocked} onClick={() => save.mutate()}>
          {save.isPending && <Loader2 className="w-4 h-4 animate-spin inline mr-1" aria-hidden="true" />}
          Save changes
        </button>
      </div>
    </Modal>
  );
}
