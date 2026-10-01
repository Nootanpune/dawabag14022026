'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createPurchaseOrder } from '@/lib/purchasing/api';
import type { NewPurchaseOrder } from '@/lib/purchasing/types';
import { rupeesToPaise } from '@/lib/admin/format';
import { todayIST } from '@/lib/fulfilment/roles';
import { getApiErrorMessage } from '@/lib/apiErrors';
import SupplierSelect from './SupplierSelect';
import PoItemsEditor, { type PoItemDraft } from './PoItemsEditor';

function buildBody(vendorId: string, expectedBy: string, notes: string, items: PoItemDraft[]): NewPurchaseOrder | string {
  if (!vendorId) return 'Choose a supplier';
  if (!items.length) return 'Add at least one product';
  if (expectedBy && expectedBy < todayIST()) return 'Expected date cannot be in the past';
  const out: NewPurchaseOrder['items'] = [];
  for (const it of items) {
    if (!/^\d+$/.test(it.quantity.trim()) || Number(it.quantity) < 1) return `${it.name}: quantity must be a whole number above 0`;
    const cost = rupeesToPaise(it.unit_cost);
    if (cost == null || !it.unit_cost.trim()) return `${it.name}: enter the unit cost`;
    out.push({ product_id: it.product_id, quantity: Number(it.quantity), unit_cost_paise: cost });
  }
  return { vendor_id: vendorId, ...(expectedBy && { expected_by: expectedBy }), ...(notes.trim() && { notes: notes.trim() }), items: out };
}

/** New draft PO. Totals and GST are worked out by the server from the catalogue GST rate. */
export default function PoForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [vendorId, setVendorId] = useState('');
  const [expectedBy, setExpectedBy] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<PoItemDraft[]>([]);
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: createPurchaseOrder,
    onSuccess: (po) => {
      toast.success(`${po.po_number} saved as draft`);
      queryClient.invalidateQueries({ queryKey: ['purchasing', 'orders'] });
      router.push(`/admin/purchase-orders/${po.id}`);
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not save the purchase order')),
  });

  const submit = () => {
    const body = buildBody(vendorId, expectedBy, notes, items);
    if (typeof body === 'string') return setError(body);
    setError('');
    save.mutate(body);
  };

  return (
    <div className="card space-y-4">
      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Supplier *</span>
          <SupplierSelect value={vendorId} onChange={setVendorId} />
        </label>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Expected by</span>
          <input type="date" min={todayIST()} value={expectedBy} onChange={(e) => setExpectedBy(e.target.value)} className="input" />
        </label>
        <label className="block sm:col-span-2">
          <span className="block font-medium text-gray-700 mb-1">Notes</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} className="input" />
        </label>
      </div>
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Products</h2>
        <PoItemsEditor items={items} onChange={setItems} />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end">
        <button onClick={submit} disabled={save.isPending} className="btn-primary text-sm inline-flex items-center gap-2">
          {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Save draft
        </button>
      </div>
    </div>
  );
}
