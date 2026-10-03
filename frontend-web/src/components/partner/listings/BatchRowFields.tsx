'use client';
import { Trash2 } from 'lucide-react';

export interface BatchDraft {
  batch_number: string;
  qty: string;
  expiry: string;
  mfg: string;
  coldConfirmed: boolean;
  /** Sprint 39: optional supplier details (C-02) */
  supplier: string;
  supplierLicence: string;
  invoiceNo: string;
  invoiceDate: string;
}

export const emptyBatch = (): BatchDraft => ({ batch_number: '', qty: '', expiry: '', mfg: '', coldConfirmed: false,
  supplier: '', supplierLicence: '', invoiceNo: '', invoiceDate: '' });

interface Props {
  row: BatchDraft;
  coldChain: boolean;
  onChange: (row: BatchDraft) => void;
  onRemove?: () => void;
}

/** One batch line in the stock editor. */
export default function BatchRowFields({ row, coldChain, onChange, onRemove }: Props) {
  const set = (patch: Partial<BatchDraft>) => onChange({ ...row, ...patch });
  return (
    <div className="border border-gray-200 rounded-lg p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
      <label className="block col-span-2 sm:col-span-1">
        <span className="block font-medium text-gray-600 mb-1">Batch number</span>
        <input value={row.batch_number} onChange={(e) => set({ batch_number: e.target.value })} className="input" />
      </label>
      <label className="block">
        <span className="block font-medium text-gray-600 mb-1">Quantity</span>
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={row.qty}
          onChange={(e) => set({ qty: e.target.value })}
          className="input"
        />
      </label>
      <label className="block">
        <span className="block font-medium text-gray-600 mb-1">Expiry date</span>
        <input type="date" value={row.expiry} onChange={(e) => set({ expiry: e.target.value })} className="input" />
      </label>
      <label className="block">
        <span className="block font-medium text-gray-600 mb-1">
          Mfg date <span className="text-gray-400">(optional)</span>
        </span>
        <input type="date" value={row.mfg} onChange={(e) => set({ mfg: e.target.value })} className="input" />
      </label>
      <details className="col-span-2 sm:col-span-4" open={!!(row.supplier || row.invoiceNo)}>
        <summary className="cursor-pointer text-gray-700 font-medium">
          Supplier details <span className="text-gray-500 font-normal">(optional; needed for Schedule H1 and cold-chain batches when Dawabag asks)</span>
        </summary>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
          <label className="block col-span-2 sm:col-span-1"><span className="block font-medium text-gray-600 mb-1">Supplier name</span>
            <input value={row.supplier} maxLength={255} onChange={(e) => set({ supplier: e.target.value })} className="input" /></label>
          <label className="block"><span className="block font-medium text-gray-600 mb-1">Supplier licence no.</span>
            <input value={row.supplierLicence} maxLength={100} onChange={(e) => set({ supplierLicence: e.target.value })} className="input" /></label>
          <label className="block"><span className="block font-medium text-gray-600 mb-1">Purchase invoice no.</span>
            <input value={row.invoiceNo} maxLength={100} onChange={(e) => set({ invoiceNo: e.target.value })} className="input" /></label>
          <label className="block"><span className="block font-medium text-gray-600 mb-1">Invoice date</span>
            <input type="date" value={row.invoiceDate} onChange={(e) => set({ invoiceDate: e.target.value })} className="input" /></label>
        </div>
        <p className="text-gray-500 mt-1">Recorded once for the batch and cannot be changed later.</p>
      </details>
      <div className="col-span-2 sm:col-span-4 flex items-center justify-between gap-2">
        {coldChain ? (
          <label className="flex items-center gap-2 text-gray-700">
            <input
              type="checkbox"
              checked={row.coldConfirmed}
              onChange={(e) => set({ coldConfirmed: e.target.checked })}
            />
            Stored in cold chain (2–8 °C) — confirmed
          </label>
        ) : (
          <span />
        )}
        {onRemove && (
          <button onClick={onRemove} className="p-1 text-gray-400 hover:text-red-500" aria-label="Remove batch">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
