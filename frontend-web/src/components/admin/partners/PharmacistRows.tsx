'use client';
import { Plus, Trash2 } from 'lucide-react';
import type { PharmacistRow } from '@/lib/admin/partnerOnboarding';
import FormSection from './FormSection';

interface Props {
  rows: PharmacistRow[];
  onChange: (rows: PharmacistRow[]) => void;
}

/** Registered pharmacists working at the partner's premises (C-03): name + council registration. */
export default function PharmacistRows({ rows, onChange }: Props) {
  const update = (i: number, patch: Partial<PharmacistRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <FormSection title="Pharmacists" hint="Each registered pharmacist with their State Pharmacy Council registration number.">
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={i} className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <label className="block">
              <span className="block font-medium text-gray-700 mb-1">Pharmacist {i + 1} — full name</span>
              <input value={r.full_name} onChange={(e) => update(i, { full_name: e.target.value })} className="input" maxLength={200} />
            </label>
            <label className="block">
              <span className="block font-medium text-gray-700 mb-1">Pharmacist {i + 1} — registration number</span>
              <input value={r.registration_no} onChange={(e) => update(i, { registration_no: e.target.value.toUpperCase() })}
                className="input font-mono" maxLength={100} />
            </label>
            <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} disabled={rows.length === 1}
              className="btn-outline py-2 px-3 disabled:opacity-40" aria-label={`Remove pharmacist ${i + 1}`}>
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => onChange([...rows, { full_name: '', registration_no: '' }])}
          className="btn-outline text-xs py-1.5 px-3 inline-flex items-center gap-1">
          <Plus className="w-4 h-4" aria-hidden="true" /> Add another pharmacist
        </button>
      </div>
    </FormSection>
  );
}
