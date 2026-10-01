'use client';
import { X } from 'lucide-react';
import { teleListShort } from '@/lib/telemedicine/labels';
import type { MedicineRowValues } from '@/lib/telemedicine/prescriptionForm';
import MedicineSearch from './MedicineSearch';

interface Props {
  n: number;
  row: MedicineRowValues;
  onChange: (r: MedicineRowValues) => void;
  onRemove: () => void;
}

export default function MedicineRow({ n, row, onChange, onRemove }: Props) {
  const set = (patch: Partial<MedicineRowValues>) => onChange({ ...row, ...patch });
  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-gray-500">Medicine {n}</p>
        <button type="button" onClick={onRemove} className="text-gray-400 hover:text-red-500" aria-label={`Remove medicine ${n}`}>
          <X className="w-4 h-4" />
        </button>
      </div>
      {row.product ? (
        <div className="flex items-center justify-between gap-2 text-sm">
          <p>
            <span className="font-medium">{row.product.name}</span>
            {row.product.generic_name && <span className="text-gray-500"> · {row.product.generic_name}</span>}
            <span className="text-xs text-gray-400">
              {' '}
              ({row.product.drug_schedule ?? 'OTC'}
              {row.product.telemedicine_list !== undefined && `, ${teleListShort(row.product.telemedicine_list)}`})
            </span>
          </p>
          <button type="button" onClick={() => set({ product: null })} className="text-xs text-brand-600 hover:underline">
            Change
          </button>
        </div>
      ) : (
        <MedicineSearch onPick={(product) => set({ product })} />
      )}
      <div className="grid sm:grid-cols-4 gap-2">
        <input value={row.dosage} onChange={(e) => set({ dosage: e.target.value })} maxLength={100} placeholder="Dose, e.g. 1 tablet" className="input" />
        <input value={row.frequency} onChange={(e) => set({ frequency: e.target.value })} maxLength={100} placeholder="How often, e.g. twice a day" className="input" />
        <input
          type="number"
          min={1}
          max={365}
          value={row.duration_days}
          onChange={(e) => set({ duration_days: e.target.value })}
          placeholder="Days"
          className="input"
          aria-label="Days"
        />
        <input value={row.instructions} onChange={(e) => set({ instructions: e.target.value })} maxLength={500} placeholder="Instructions (optional)" className="input" />
      </div>
    </div>
  );
}
