'use client';
import { COLD_CHAIN_STORAGE, NEVER_ONLINE, type Draft, type DraftOptions, type DraftPatch } from '@/lib/admin/catalogueDrafts';
import { DraftSelect, DraftText } from './DraftInputs';

const RX_TEXT: Record<string, string> = {
  needed: 'Prescription needed for patients (C-08)',
  'not needed': 'No prescription needed',
  'never sold online': 'Never sold online (C-10)',
};

/** The details a person must decide for one draft. Schedule and clinical details are per product only. */
export default function DraftFieldsGrid({ draft, options, onSave, disabled }: {
  draft: Draft;
  options: DraftOptions | undefined;
  onSave: (patch: DraftPatch) => void;
  disabled?: boolean;
}) {
  const id = (k: string) => `d-${draft.id}-${k}`;
  const neverOnline = !!draft.drug_schedule && NEVER_ONLINE.includes(draft.drug_schedule);
  const cold = draft.cold_chain_decided ? (draft.cold_chain ? 'yes' : 'no') : '';
  const setCold = (v: string) => {
    if (!v) return;
    // Choosing cold chain offers the 2–8 °C storage line if none is written yet (C-25)
    onSave(v === 'yes' && !draft.storage_instructions ? { cold_chain: true, storage_instructions: COLD_CHAIN_STORAGE } : { cold_chain: v === 'yes' });
  };
  const common = { disabled };

  return (
    <div className="space-y-3">
      <fieldset className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="text-xs font-semibold text-gray-700 mb-1">Pharmacist decides</legend>
        <DraftSelect id={id('schedule')} label="Drug schedule" value={draft.drug_schedule ?? ''} {...common}
          options={(options?.schedules ?? []).map((s) => ({ value: s, label: s }))}
          hint={draft.requires_prescription ? RX_TEXT[draft.requires_prescription] : 'Decides whether a prescription is needed'}
          onSave={(v) => onSave({ drug_schedule: v || null })} />
        <DraftText id={id('generic')} label="Generic name" value={draft.generic_name} {...common} onSave={(v) => onSave({ generic_name: v })} />
        {!neverOnline && (
          <>
            <DraftText id={id('strength')} label="Strength" value={draft.strength} placeholder="e.g. 650 mg" maxLength={100} {...common}
              hint='Write "none" if it has none' onSave={(v) => onSave({ strength: v })} />
            <DraftSelect id={id('form')} label="Dosage form" value={draft.dosage_form ?? ''} {...common}
              options={(options?.dosage_forms ?? []).map((s) => ({ value: s, label: s }))} onSave={(v) => onSave({ dosage_form: v || null })} />
            <DraftText id={id('composition')} label="Composition (optional)" value={draft.composition} {...common} className="sm:col-span-2"
              onSave={(v) => onSave({ composition: v })} />
            <DraftSelect id={id('cold')} label="Cold chain (2–8 °C)" value={cold} {...common}
              options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes, 2–8 °C' }]} onSave={setCold} />
            <DraftText id={id('storage')} label="Storage instructions" value={draft.storage_instructions} {...common}
              onSave={(v) => onSave({ storage_instructions: v })} />
          </>
        )}
      </fieldset>

      {neverOnline ? (
        <p className="text-xs text-red-700 bg-red-50 rounded-lg p-2">
          {draft.drug_schedule}: approving keeps this product on record but it can never be listed or sold online (C-10). The partner&apos;s request is closed.
        </p>
      ) : (
        <>
          <fieldset className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <legend className="text-xs font-semibold text-gray-700 mb-1">Product and tax</legend>
            <DraftText id={id('name')} label="Product name" value={draft.name} {...common} className="sm:col-span-2"
              onSave={(v) => { if (v) onSave({ name: v }); }} />
            <DraftText id={id('category')} label="Category" value={draft.category} list="draft-categories" maxLength={100} {...common}
              onSave={(v) => onSave({ category: v })} />
            <DraftText id={id('pack')} label="Pack (net quantity)" value={draft.net_quantity} maxLength={50} {...common}
              onSave={(v) => onSave({ net_quantity: v })} />
            <DraftText id={id('hsn')} label="HSN code" value={draft.hsn_code} list="draft-hsn" maxLength={8} {...common}
              hint={draft.from_file.hsn_code && !draft.hsn_code ? <>File says {draft.from_file.hsn_code}{' '}
                <button type="button" className="underline" onClick={() => onSave({ hsn_code: draft.from_file.hsn_code })}>use it</button></> : '4, 6 or 8 digits'}
              onSave={(v) => onSave({ hsn_code: v })} />
            <DraftSelect id={id('gst')} label="GST rate" value={draft.gst_rate == null ? '' : String(draft.gst_rate)} {...common}
              options={(options?.gst_rates ?? []).map((g) => ({ value: String(g), label: `${g}%` }))}
              onSave={(v) => onSave({ gst_rate: v === '' ? null : Number(v) })} />
          </fieldset>

          <fieldset className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <legend className="text-xs font-semibold text-gray-700 mb-1">Shown on the product page (C-17)</legend>
            <DraftText id={id('maker')} label="Manufacturer name" value={draft.manufacturer_name} maxLength={255} {...common}
              onSave={(v) => onSave({ manufacturer_name: v })} />
            <DraftText id={id('address')} label="Manufacturer address" value={draft.manufacturer_address} maxLength={1000} {...common}
              className="sm:col-span-2" onSave={(v) => onSave({ manufacturer_address: v })} />
            <DraftText id={id('country')} label="Country of origin" value={draft.country_of_origin} maxLength={60} {...common}
              onSave={(v) => onSave({ country_of_origin: v })} />
            <DraftText id={id('marketed')} label="Marketed by (company)" value={draft.marketed_by} maxLength={255} {...common}
              hint="The file's company code; write it out in full if you know it" onSave={(v) => onSave({ marketed_by: v })} />
            <div className="sm:col-span-2 lg:col-span-3">
              <DraftText id={id('description')} label="Description for buyers" value={draft.description} multiline maxLength={2000} {...common}
                hint="Keep it to the generic name, strength, form and pack — no claims (C-19)" onSave={(v) => onSave({ description: v })} />
              {draft.suggested_description && draft.description !== draft.suggested_description && (
                <button type="button" disabled={disabled} onClick={() => onSave({ description: draft.suggested_description })}
                  className="text-xs underline text-brand-700 mt-0.5">
                  Use: “{draft.suggested_description}”
                </button>
              )}
            </div>
          </fieldset>
        </>
      )}
    </div>
  );
}
