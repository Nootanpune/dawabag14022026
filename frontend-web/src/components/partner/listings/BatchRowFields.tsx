'use client';
import { Trash2 } from 'lucide-react';

export interface BatchDraft {
  batch_number: string;
  qty: string;
  expiry: string;
  mfg: string;
  coldConfirmed: boolean;
}

export const emptyBatch = (): BatchDraft => ({ batch_number: '', qty: '', expiry: '', mfg: '', coldConfirmed: false });

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
