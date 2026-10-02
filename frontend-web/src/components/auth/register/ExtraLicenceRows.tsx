'use client';
import { useFieldArray, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import type { DetailsFormValues } from '@/lib/registration';
import { FORM_INFO, LICENCE_FORMS } from '@/lib/licences/forms';

interface Props {
  control: Control<DetailsFormValues>;
  register: UseFormRegister<DetailsFormValues>;
  errors: FieldErrors<DetailsFormValues>;
  /** doctor / hospital: licences are optional (e.g. a hospital pharmacy licence) */
  optionalOnly?: boolean;
}

/**
 * Every other drug licence the business holds (Sprint 30) — e.g. Form 21 next to Form 20,
 * or 21B next to 20B — each with its form and number; the valid-till date is optional
 * here and checked by Dawabag's team from the uploaded licence (C-11).
 */
export default function ExtraLicenceRows({ control, register, errors, optionalOnly }: Props) {
  const { fields, append, remove } = useFieldArray({ control, name: 'extra_licences' });
  return (
    <div className="space-y-3">
      {fields.map((f, i) => {
        const e = errors.extra_licences?.[i];
        return (
          <div key={f.id} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-start border border-gray-200 rounded-lg p-3">
            <label className="block text-sm">
              <span className="block font-medium text-gray-700 mb-1">Licence {i + 2} — form</span>
              <select {...register(`extra_licences.${i}.form` as const)} className="input" aria-label={`Licence ${i + 2} — form`}>
                <option value="">Select</option>
                {LICENCE_FORMS.filter((x) => x !== 'other').map((x) => <option key={x} value={x}>{FORM_INFO[x].label} — {FORM_INFO[x].hint}</option>)}
              </select>
              {e?.form?.message && <span className="text-xs text-red-500">{e.form.message}</span>}
            </label>
            <label className="block text-sm">
              <span className="block font-medium text-gray-700 mb-1">Licence {i + 2} — number</span>
              <input {...register(`extra_licences.${i}.number` as const)} className="input" aria-label={`Licence ${i + 2} — number`} />
              {e?.number?.message && <span className="text-xs text-red-500">{e.number.message}</span>}
            </label>
            <label className="block text-sm">
              <span className="block font-medium text-gray-700 mb-1">Valid till (optional)</span>
              <input type="date" {...register(`extra_licences.${i}.valid_upto` as const)} className="input" aria-label={`Licence ${i + 2} — valid till`} />
              {e?.valid_upto?.message && <span className="text-xs text-red-500">{e.valid_upto.message}</span>}
            </label>
            <button type="button" onClick={() => remove(i)} className="btn-outline py-2 px-3 sm:mt-6" aria-label={`Remove licence ${i + 2}`}>
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        );
      })}
      <button type="button" onClick={() => append({ form: '', number: '', valid_upto: '' })}
        className="btn-outline text-xs py-1.5 px-3 inline-flex items-center gap-1">
        <Plus className="w-4 h-4" aria-hidden="true" /> {optionalOnly ? 'Add a drug licence (hospital / clinic pharmacy)' : 'Add another drug licence'}
      </button>
    </div>
  );
}
