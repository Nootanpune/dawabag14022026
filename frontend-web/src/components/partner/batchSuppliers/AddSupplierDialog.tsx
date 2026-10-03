'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Modal from '@/components/admin/Modal';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { addMyBatchProvenance, type BatchProvenance, type ProvenanceInput } from '@/lib/partnerProvenance/api';

const FIELDS: { key: keyof ProvenanceInput; label: string; hint: string }[] = [
  { key: 'supplier_name', label: 'Supplier name', hint: 'Who you bought this batch from' },
  { key: 'supplier_licence_no', label: 'Supplier drug licence no.', hint: 'As on their invoice' },
  { key: 'supplier_invoice_no', label: 'Purchase invoice no.', hint: 'Your purchase bill number' },
  { key: 'supplier_invoice_date', label: 'Purchase invoice date', hint: 'DD/MM/YYYY' },
];

/** Record the supplier details of one batch (once; they cannot be changed afterwards). */
export default function AddSupplierDialog({ batch, onClose }: { batch: BatchProvenance; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [v, setV] = useState<ProvenanceInput>({ supplier_name: '', supplier_licence_no: '', supplier_invoice_no: '', supplier_invoice_date: '' });
  const empty = !v.supplier_name.trim() && !v.supplier_invoice_no.trim();
  const save = useMutation({
    mutationFn: () => addMyBatchProvenance(batch.partner_inventory_id, v),
    onSuccess: () => { toast.success('Supplier details recorded'); queryClient.invalidateQueries({ queryKey: ['partner', 'batch-provenance'] }); onClose(); },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Could not record the supplier details')),
  });
  return (
    <Modal title={`Supplier of ${batch.product_name ?? 'batch'} ${batch.batch_number}`} onClose={onClose}>
      <div className="space-y-3 text-sm">
        {FIELDS.map((f) => (
          <label key={f.key} className="block"><span className="block font-medium text-gray-700 mb-1">{f.label} <span className="font-normal text-xs text-gray-400">({f.hint})</span></span>
            <input className="input" value={v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />
          </label>
        ))}
        <p className="text-xs text-gray-600">Check them against your purchase invoice: once saved they cannot be changed.</p>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button type="button" onClick={onClose} className="btn-outline text-sm">Cancel</button>
        <button type="button" disabled={empty || save.isPending} onClick={() => save.mutate()} className="btn-primary text-sm disabled:opacity-50">Save</button>
      </div>
    </Modal>
  );
}
