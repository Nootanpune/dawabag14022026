'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { partnerKeys, saveInventory } from '@/lib/partner/api';
import type { BatchInput, PartnerListing, SavedBatch } from '@/lib/partner/types';
import { getApiErrorMessage } from '@/lib/apiErrors';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';
import BatchRowFields, { emptyBatch, type BatchDraft } from './BatchRowFields';
import SavedBatchesTable from './SavedBatchesTable';

function toInput(rows: BatchDraft[], coldChain: boolean): BatchInput[] | string {
  const out: BatchInput[] = [];
  for (const r of rows) {
    const qty = Number(r.qty);
    if (!r.batch_number.trim()) return 'Every row needs a batch number';
    if (r.qty === '' || !Number.isInteger(qty) || qty < 0) return `Batch ${r.batch_number}: enter a whole quantity`;
    if (!r.expiry) return `Batch ${r.batch_number}: expiry date is required`;
    if (coldChain && !r.coldConfirmed) return `Batch ${r.batch_number}: confirm cold-chain storage`;
    out.push({
      batch_number: r.batch_number.trim(),
      qty_available: qty,
      expiry_date: r.expiry,
      manufactured_date: r.mfg || undefined,
      ...(coldChain && { cold_chain_confirmed: true }),
      // Sprint 39: supplier details, sent only when given (C-02)
      ...(r.supplier.trim() && { supplier_name: r.supplier.trim() }),
      ...(r.supplierLicence.trim() && { supplier_licence_no: r.supplierLicence.trim() }),
      ...(r.invoiceNo.trim() && { supplier_invoice_no: r.invoiceNo.trim() }),
      ...(r.invoiceDate && { supplier_invoice_date: r.invoiceDate }),
    });
  }
  return out;
}

export default function StockEditorDialog({ listing, onClose }: { listing: PartnerListing; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<BatchDraft[]>([emptyBatch()]);
  const [saved, setSaved] = useState<SavedBatch[] | null>(null);
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: (batches: BatchInput[]) => saveInventory(listing.id, batches),
    onSuccess: (batches) => {
      toast.success('Stock updated');
      setSaved(batches);
      setRows([emptyBatch()]);
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not update stock')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: partnerKeys.listings }),
  });

  const submit = () => {
    const input = toInput(rows, listing.cold_chain);
    if (typeof input === 'string') return setError(input);
    setError('');
    save.mutate(input);
  };

  return (
    <Modal title={`Stock — ${listing.medicine_name}`} onClose={onClose} size="lg">
      <p className="text-xs text-gray-500 mb-3">
        Currently {listing.qty_available ?? 0} available, {listing.qty_reserved ?? 0} reserved for orders. Enter an
        existing batch number to update that batch; quantity cannot go below what is reserved.
      </p>
      <div className="space-y-2">
        {rows.map((row, i) => (
          <BatchRowFields
            key={i}
            row={row}
            coldChain={listing.cold_chain}
            onChange={(r) => setRows(rows.map((x, j) => (j === i ? r : x)))}
            onRemove={rows.length > 1 ? () => setRows(rows.filter((_, j) => j !== i)) : undefined}
          />
        ))}
      </div>
      <button
        onClick={() => setRows([...rows, emptyBatch()])}
        className="mt-2 text-sm text-brand-600 hover:underline inline-flex items-center gap-1"
      >
        <Plus className="w-4 h-4" /> Add batch
      </button>
      {saved && <SavedBatchesTable batches={saved} />}
      <DialogActions onCancel={onClose} onConfirm={submit} confirmLabel="Save stock" pending={save.isPending} error={error} />
    </Modal>
  );
}
