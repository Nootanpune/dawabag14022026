'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createPurchaseReturn, purchaseReturnKeys } from '@/lib/purchaseReturns/api';
import { PURCHASE_RETURN_REASONS, type PurchaseReturnReason } from '@/lib/purchaseReturns/types';
import { RETURN_REASON_LABELS } from '@/lib/purchaseReturns/labels';
import { draftCostPaise, emptyReturnDraft, returnBody, returnProblems, type ReturnDraft } from '@/lib/purchaseReturns/form';
import { fetchReturnableBatches, stockControlKeys } from '@/lib/stock/api';
import { splitServerProblems } from '@/lib/purchasing/receiptForm';
import { formatPaise } from '@/lib/admin/format';
import { getApiErrorMessage } from '@/lib/apiErrors';
import SupplierSelect from '@/components/admin/purchasing/SupplierSelect';
import QueryState from '@/components/admin/QueryState';
import ProblemList from '@/components/staff/receive/ProblemList';
import ReturnBatchPicker from './ReturnBatchPicker';

/**
 * Raise a return of stock to the supplier it came from (C-28). Nothing leaves the
 * batches yet: stock is taken out when a second person approves the return (C-46).
 */
export default function PurchaseReturnForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<ReturnDraft>(emptyReturnDraft);
  const [recalled, setRecalled] = useState(false);
  const [problems, setProblems] = useState<{ title: string; list: string[] }>({ title: '', list: [] });
  const set = (patch: Partial<ReturnDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const batches = useQuery({
    queryKey: stockControlKeys.returnable(draft.vendor_id, recalled),
    queryFn: () => fetchReturnableBatches(draft.vendor_id, recalled),
    enabled: !!draft.vendor_id,
  });
  const rows = batches.data ?? [];

  const save = useMutation({
    mutationFn: createPurchaseReturn,
    onSuccess: (r) => {
      toast.success(`${r.return_no} raised · ${formatPaise(r.total_paise)} incl. GST · awaiting approval`);
      queryClient.invalidateQueries({ queryKey: purchaseReturnKeys.all });
      router.push(`/staff/purchase-returns/${r.id}`);
    },
    onError: (err: any) => {
      const msg = getApiErrorMessage(err, 'Could not raise the return');
      const status = err?.response?.status;
      setProblems({ title: status === 422 ? 'Fix these and save again' : 'Return refused', list: status === 422 ? splitServerProblems(msg) : [msg] });
    },
  });

  const submit = () => {
    const list = returnProblems(draft, rows);
    if (list.length) return setProblems({ title: 'Fix these and save again', list });
    setProblems({ title: '', list: [] });
    save.mutate(returnBody(draft, rows));
  };
  const cost = draftCostPaise(draft, rows);

  return (
    <div className="space-y-4">
      <div className="card grid sm:grid-cols-2 gap-3 text-sm">
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Supplier</span>
          {/* a new supplier means a new batch list, so ticks are cleared */}
          <SupplierSelect value={draft.vendor_id} onChange={(id) => set({ vendor_id: id, qty: {} })} />
        </label>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Reason</span>
          <select value={draft.reason} onChange={(e) => set({ reason: e.target.value as PurchaseReturnReason })} className="input">
            <option value="">Select reason</option>
            {PURCHASE_RETURN_REASONS.map((r) => (
              <option key={r} value={r}>
                {RETURN_REASON_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="block font-medium text-gray-700 mb-1">Notes</span>
          <textarea
            value={draft.notes}
            onChange={(e) => set({ notes: e.target.value })}
            rows={2}
            maxLength={1000}
            className="input"
            placeholder="e.g. recall notice reference, damage found at count"
          />
        </label>
      </div>

      <div className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-700">Batches to return</h2>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={recalled}
              onChange={(e) => {
                setRecalled(e.target.checked);
                set({ qty: {} });
              }}
            />
            Recalled stock
          </label>
        </div>
        {!draft.vendor_id ? (
          <p className="text-sm text-gray-400">Choose the supplier to see its batches.</p>
        ) : (
          <>
            <QueryState
              isLoading={batches.isLoading}
              error={batches.error}
              isEmpty={!rows.length}
              emptyText={recalled ? 'No recalled stock on hand' : 'No stock from this supplier'}
            />
            {!!rows.length && <ReturnBatchPicker batches={rows} vendorId={draft.vendor_id} qty={draft.qty} onChange={(qty) => set({ qty })} />}
          </>
        )}
        {cost > 0 && <p className="text-sm text-right">Cost value {formatPaise(cost)} + GST (worked out by the server)</p>}
      </div>

      <ProblemList title={problems.title} problems={problems.list} />
      <div className="flex justify-end">
        <button onClick={submit} disabled={save.isPending} className="btn-primary text-sm inline-flex items-center gap-2">
          {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Raise return
        </button>
      </div>
    </div>
  );
}
