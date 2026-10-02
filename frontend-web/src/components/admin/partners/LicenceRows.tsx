'use client';
import { LICENCE_FORMS, type LicenceForm, type LicenceRow } from '@/lib/admin/partnerOnboarding';
import FormSection from './FormSection';

interface Props {
  licences: Record<LicenceForm, LicenceRow>;
  today: string;
  onChange: (form: LicenceForm, row: LicenceRow) => void;
}

/**
 * The four drug licence forms. Tick each one the partner holds and enter its number
 * and valid-till date (C-02, C-07). Retail (20/21) lets it sell to patients; wholesale
 * (20B/21B) to licensed trade buyers.
 */
export default function LicenceRows({ licences, today, onChange }: Props) {
  return (
    <FormSection title="Drug licences" hint="Tick every licence the partner holds. An expired licence cannot be accepted.">
      <div className="space-y-3">
        {LICENCE_FORMS.map(({ form, label, hint }) => {
          const l = licences[form];
          const expired = l.held && !!l.valid_upto && l.valid_upto < today;
          return (
            <fieldset key={form} className="border border-gray-200 rounded-lg p-3">
              <legend className="sr-only">{label}</legend>
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={l.held} onChange={(e) => onChange(form, { ...l, held: e.target.checked })}
                  className="mt-0.5" aria-label={`Holds ${label}`} />
                <span>
                  <span className="font-medium text-gray-900">{label}</span>
                  <span className="block text-xs text-gray-500">{hint}</span>
                </span>
              </label>
              {l.held && (
                <div className="grid sm:grid-cols-2 gap-3 mt-3">
                  <label className="block">
                    <span className="block font-medium text-gray-700 mb-1">{label} licence number</span>
                    <input value={l.number} onChange={(e) => onChange(form, { ...l, number: e.target.value })} className="input font-mono"
                      maxLength={100} />
                  </label>
                  <label className="block">
                    <span className="block font-medium text-gray-700 mb-1">{label} valid till</span>
                    <input type="date" value={l.valid_upto} min={today} onChange={(e) => onChange(form, { ...l, valid_upto: e.target.value })}
                      className="input" aria-invalid={expired || undefined} />
                    {expired && <span className="block text-xs text-red-600 mt-1">This licence has expired — ask for the renewed one</span>}
                  </label>
                </div>
              )}
            </fieldset>
          );
        })}
      </div>
    </FormSection>
  );
}
