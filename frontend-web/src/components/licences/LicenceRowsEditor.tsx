'use client';
import { Plus, Trash2 } from 'lucide-react';
import {
  blankLicence, FORM_INFO, formLabel, LICENCE_FORMS, validityOf, type LicenceDraft, type LicenceForm,
} from '@/lib/licences/forms';

interface Props {
  rows: LicenceDraft[];
  onChange: (rows: LicenceDraft[]) => void;
  today: string;
  /** Forms offered first in the list (e.g. 20B / 21B for a wholesaler); every form stays available. */
  suggested?: LicenceForm[];
  /** Valid-till is required (admins entering a checked licence); buyers may leave it for the admin. */
  requireValidUpto?: boolean;
  /** Show issuing authority and valid-from (optional details). */
  showDetails?: boolean;
  /** Prefix for field labels when two editors share a page. */
  idPrefix?: string;
  addLabel?: string;
  minRows?: number;
}

const GROUPS = ['Retail', 'Wholesale', 'Manufacture', 'Other forms'];

/**
 * Repeatable drug licence rows: form, number, valid till (and optionally issuing authority
 * and valid from). Any form can be added — "Other" takes a typed form name. An expired
 * date is flagged at once (C-02, C-07, C-11, C-33); the server repeats every check.
 */
export default function LicenceRowsEditor({
  rows, onChange, today, suggested = [], requireValidUpto = true, showDetails = false, idPrefix = 'licence', addLabel = 'Add another licence', minRows = 1,
}: Props) {
  const update = (i: number, patch: Partial<LicenceDraft>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-3">
      {rows.map((r, i) => {
        const n = i + 1;
        const v = validityOf(r.valid_upto, today);
        const label = r.form ? formLabel(r.form, r.form_name) : `Licence ${n}`;
        return (
          <fieldset key={r.key} className="border border-gray-200 rounded-lg p-3" data-testid={`${idPrefix}-row`}>
            <legend className="px-1 text-xs font-medium text-gray-600">{label}</legend>
            <div className="grid sm:grid-cols-2 lg:grid-cols-[1.1fr_1.4fr_1fr_auto] gap-3 items-start">
              <label className="block">
                <span className="block font-medium text-gray-700 mb-1">Licence {n} — form</span>
                <select value={r.form} onChange={(e) => update(i, { form: e.target.value as LicenceForm })} className="input"
                  aria-label={`Licence ${n} — form`}>
                  <option value="">Choose the form</option>
                  {suggested.length > 0 && (
                    <optgroup label="Usual for this account">
                      {suggested.map((f) => <option key={`s-${f}`} value={f}>{FORM_INFO[f].label} — {FORM_INFO[f].hint}</option>)}
                    </optgroup>
                  )}
                  {GROUPS.map((g) => (
                    <optgroup key={g} label={g}>
                      {LICENCE_FORMS.filter((f) => FORM_INFO[f].group === g && !suggested.includes(f)).map((f) => (
                        <option key={f} value={f}>{FORM_INFO[f].label} — {FORM_INFO[f].hint}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block font-medium text-gray-700 mb-1">Licence {n} — number</span>
                <input value={r.licence_number} onChange={(e) => update(i, { licence_number: e.target.value })} className="input font-mono"
                  maxLength={100} autoComplete="off" aria-label={`Licence ${n} — number`} />
              </label>
              <label className="block">
                <span className="block font-medium text-gray-700 mb-1">Licence {n} — valid till{requireValidUpto ? '' : ' (if known)'}</span>
                <input type="date" value={r.valid_upto} min={today} onChange={(e) => update(i, { valid_upto: e.target.value })}
                  className="input" aria-invalid={v === 'expired' || undefined} aria-label={`Licence ${n} — valid till`} />
                {v === 'expired' && <span className="block text-xs text-red-600 mt-1">This licence has expired — enter the renewed one</span>}
                {v === 'expiring' && <span className="block text-xs text-amber-700 mt-1">Ends within 30 days — renew soon</span>}
              </label>
              <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} disabled={rows.length <= minRows}
                className="btn-outline py-2 px-3 disabled:opacity-40 sm:mt-6" aria-label={`Remove licence ${n}`}>
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            {r.form === 'other' && (
              <label className="block mt-3">
                <span className="block font-medium text-gray-700 mb-1">Licence {n} — name of the form</span>
                <input value={r.form_name} onChange={(e) => update(i, { form_name: e.target.value })} className="input" maxLength={80}
                  placeholder="As printed on the licence" aria-label={`Licence ${n} — name of the form`} />
              </label>
            )}
            {showDetails && (
              <div className="grid sm:grid-cols-2 gap-3 mt-3">
                <label className="block">
                  <span className="block font-medium text-gray-700 mb-1">Licence {n} — issued by (optional)</span>
                  <input value={r.issued_by} onChange={(e) => update(i, { issued_by: e.target.value })} className="input" maxLength={200}
                    placeholder="e.g. FDA Maharashtra, Pune" />
                </label>
                <label className="block">
                  <span className="block font-medium text-gray-700 mb-1">Licence {n} — valid from (optional)</span>
                  <input type="date" value={r.valid_from} max={today} onChange={(e) => update(i, { valid_from: e.target.value })} className="input" />
                </label>
              </div>
            )}
          </fieldset>
        );
      })}
      <button type="button" onClick={() => onChange([...rows, blankLicence()])}
        className="btn-outline text-xs py-1.5 px-3 inline-flex items-center gap-1">
        <Plus className="w-4 h-4" aria-hidden="true" /> {addLabel}
      </button>
    </div>
  );
}
