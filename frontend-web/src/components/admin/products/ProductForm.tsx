'use client';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { DRUG_SCHEDULES } from '@/lib/admin/products';
import CategoryPicker from '@/components/catalogueLists/CategoryPicker';
import HsnPicker from '@/components/catalogueLists/HsnPicker';
import { QuickCreateHint } from '@/components/catalogueLists/QuickCreateArea';
import {
  COPY_FIELDS,
  DECLARATION_FIELDS,
  PRICE_FIELDS,
  QTY_FIELDS,
  TEXT_FIELDS,
  type ProductFormValues,
} from '@/lib/admin/productForm';
import ProductFieldGrid from './ProductFieldGrid';
import ScheduleCField from '@/components/catalogue/ScheduleCField';

interface Props {
  initial: ProductFormValues;
  editing?: boolean;
  pending: boolean;
  error: string;
  fieldErrors: Record<string, string>;
  submitLabel: string;
  onSubmit: (values: ProductFormValues) => void;
}

/** Create / edit form for one catalogue product. */
export default function ProductForm({ initial, editing, pending, error, fieldErrors, submitLabel, onSubmit }: Props) {
  const [v, setV] = useState<ProductFormValues>(initial);
  const setText = (key: string, value: string) => setV((s) => ({ ...s, text: { ...s.text, [key]: value } }));
  const grid = { values: v.text, onChange: setText, editing, fieldErrors };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
    >
      <section className="card grid sm:grid-cols-2 gap-3 text-sm">
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">SKU</span>
          <input
            value={v.sku}
            onChange={(e) => setV({ ...v, sku: e.target.value.toUpperCase() })}
            disabled={editing}
            className="input font-mono disabled:bg-gray-50"
          />
          {editing && <span className="block text-xs text-gray-400 mt-1">The SKU cannot be changed</span>}
          {fieldErrors.sku && <span className="block text-xs text-red-500 mt-1">{fieldErrors.sku}</span>}
        </label>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Drug schedule</span>
          <select value={v.drug_schedule} onChange={(e) => setV({ ...v, drug_schedule: e.target.value })} className="input">
            {DRUG_SCHEDULES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {/* C-10: Schedule X / NDPS are never sold online */}
          {(v.drug_schedule === 'Schedule X' || v.drug_schedule === 'NDPS') && (
            <span className="block text-xs text-amber-700 mt-1">Never sold online — it will not appear in the shop.</span>
          )}
          {v.drug_schedule === 'Non-scheduled' && (
            <span className="block text-xs text-gray-500 mt-1">In no schedule: no prescription needed, sold online (not the same as OTC).</span>
          )}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={v.cold_chain} onChange={(e) => setV({ ...v, cold_chain: e.target.checked })} />
          Cold chain (2–8 °C)
        </label>
        <ScheduleCField checked={v.schedule_c_c1} onChange={(c) => setV({ ...v, schedule_c_c1: c })} />
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={v.is_active} onChange={(e) => setV({ ...v, is_active: e.target.checked })} />
          Active (listed for sale)
        </label>
      </section>

      {/* Category and HSN come from the server's lists; Alt+C or "+ New" adds one (Sprint 31) */}
      <ProductFieldGrid title="Product" fields={TEXT_FIELDS} {...grid} custom={{
        category: <CategoryPicker id="product-category" value={v.text.category || null} onChange={(c) => setText('category', c ?? '')} />,
        hsn_code: <HsnPicker id="product-hsn" value={v.text.hsn_code || null} productGst={v.text.gst_rate} hint="optional"
          onChange={(c) => setText('hsn_code', c ?? '')} />,
      }} />
      <QuickCreateHint />
      <ProductFieldGrid
        title="Prices"
        note="Every price must be at or below MRP, and MRP at or below the NPPA ceiling where one applies (C-16)."
        fields={PRICE_FIELDS}
        {...grid}
      />
      <ProductFieldGrid title="Order quantities" fields={QTY_FIELDS} {...grid} />
      <ProductFieldGrid
        title="Pack declarations"
        note="Shown on the product page as required for pre-packed goods (C-17)."
        fields={DECLARATION_FIELDS}
        {...grid}
      />
      <ProductFieldGrid
        title="Product copy"
        note="New or changed copy is hidden from buyers until a pharmacist approves it (C-19)."
        fields={COPY_FIELDS}
        {...grid}
      />

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}
      <div className="flex justify-end">
        <button type="submit" disabled={pending} className="btn-primary inline-flex items-center gap-2">
          {pending && <Loader2 className="w-4 h-4 animate-spin" />} {submitLabel}
        </button>
      </div>
    </form>
  );
}
