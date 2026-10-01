'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createReceipt } from '@/lib/purchasing/api';
import type { PurchaseOrder } from '@/lib/purchasing/types';
import {
  blankLine,
  linesFromPo,
  receiptBody,
  receiptProblems,
  splitLine,
  splitServerProblems,
  type ReceiptHeaderDraft,
  type ReceiptLineDraft,
} from '@/lib/purchasing/receiptForm';
import { formatPaise } from '@/lib/admin/format';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { isLockedPeriodError } from '@/lib/admin/accountsLock';
import { isRecallAlertError } from '@/lib/recallAlerts/labels';
import LockedPeriodBanner from '@/components/admin/accounts/LockedPeriodBanner';
import CatalogueSearch from '@/components/admin/purchasing/CatalogueSearch';
import ReceiptHeaderFields from './ReceiptHeaderFields';
import ReceiptLineFields from './ReceiptLineFields';
import ProblemList from './ProblemList';
import RecallAlertBanner from './RecallAlertBanner';

/**
 * Goods receipt against a PO (lines prefilled with what is still due) or
 * without one. Stock enters only here; the server refuses expired supplier
 * licences (C-02), short shelf life, MRP below selling price (C-16), more than
 * ordered, Schedule X / NDPS and recalled batches (C-28).
 */
export default function ReceiptForm({ po }: { po?: PurchaseOrder }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [header, setHeader] = useState<ReceiptHeaderDraft>({
    vendor_id: po?.vendor_id ?? '',
    supplier_invoice_no: '',
    supplier_invoice_date: '',
    notes: '',
  });
  const [lines, setLines] = useState<ReceiptLineDraft[]>(() => (po ? linesFromPo(po) : []));
  const [problems, setProblems] = useState<{ title: string; list: string[] }>({ title: '', list: [] });
  // Supplier invoice dated in a closed GST period (409, Sprint 13)
  const [lockedPeriod, setLockedPeriod] = useState('');
  // Batch on a regulator recall alert not yet cleared for this product (409, C-28)
  const [onAlert, setOnAlert] = useState(false);

  const save = useMutation({
    mutationFn: createReceipt,
    onSuccess: (r) => {
      toast.success(`${r.grn_number} recorded · ${formatPaise(r.total_paise)} incl. GST ${formatPaise(r.gst_paise)}`);
      queryClient.invalidateQueries({ queryKey: ['purchasing'] });
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      router.push(`/staff/receive/${r.id}`);
    },
    onError: (err: any) => {
      const msg = getApiErrorMessage(err, 'Could not record the receipt');
      const status = err?.response?.status;
      setOnAlert(status === 409 && isRecallAlertError(msg));
      if (isLockedPeriodError(msg)) {
        setProblems({ title: '', list: [] });
        return setLockedPeriod(msg);
      }
      setProblems({
        title: status === 409 || status === 403 ? 'Receipt refused' : 'Fix these and save again',
        list: status === 422 ? splitServerProblems(msg) : [msg],
      });
    },
  });

  const patchLine = (key: string, patch: Partial<ReceiptLineDraft>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const submit = () => {
    const list = receiptProblems(header, lines);
    if (list.length) return setProblems({ title: 'Fix these and save again', list });
    setProblems({ title: '', list: [] });
    setLockedPeriod('');
    setOnAlert(false);
    save.mutate(receiptBody(header, lines, po?.id));
  };

  return (
    <div className="space-y-4">
      <div className="card">
        <ReceiptHeaderFields
          value={header}
          onChange={(p) => setHeader((h) => ({ ...h, ...p }))}
          supplierName={po?.supplier_name}
        />
      </div>
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Batches received</h2>
        {lines.map((l, i) => (
          <ReceiptLineFields
            key={l.key}
            index={i}
            line={l}
            onChange={(p) => patchLine(l.key, p)}
            onRemove={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
            onSplit={
              l.po_item_id
                ? () => setLines((ls) => ls.flatMap((x) => (x.key === l.key ? [x, splitLine(x)] : [x])))
                : undefined
            }
          />
        ))}
        {po ? (
          !lines.length && <p className="text-sm text-gray-400">Nothing left to receive on this PO.</p>
        ) : (
          <CatalogueSearch onPick={(p) => setLines((ls) => [...ls, blankLine(p)])} placeholder="Add a product received: search name or SKU" />
        )}
      </div>
      {lockedPeriod && <LockedPeriodBanner message={lockedPeriod} />}
      <ProblemList title={problems.title} problems={problems.list} />
      {onAlert && <RecallAlertBanner />}
      <div className="flex justify-end">
        <button onClick={submit} disabled={save.isPending || !lines.length} className="btn-primary text-sm inline-flex items-center gap-2">
          {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Record receipt
        </button>
      </div>
    </div>
  );
}
