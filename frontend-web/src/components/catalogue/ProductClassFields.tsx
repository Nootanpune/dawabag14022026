'use client';
import { PRODUCT_CLASSES, PRODUCT_CLASS_LABELS, type ProductClass } from '@/lib/productClass';

/**
 * Product class and the new-drug flag (Sprint 40; handover D6; C-10). A device is never sold
 * online until Dawabag has a device track; a new drug needs a pharmacist's confirmation when
 * it is allowed online. Changing either on a product on sale switches it off at once.
 */
export default function ProductClassFields({ idPrefix, productClass, isNewDrug, onChange, disabled }: {
  idPrefix: string;
  productClass: ProductClass;
  isNewDrug: boolean;
  onChange: (v: { product_class: ProductClass; is_new_drug: boolean }) => void;
  disabled?: boolean;
}) {
  return (
    <div className="text-sm space-y-2">
      <label htmlFor={`${idPrefix}-class`} className="block">
        <span className="block font-medium text-gray-700 mb-1">Product class</span>
        <select id={`${idPrefix}-class`} className="input" value={productClass} disabled={disabled}
          onChange={(e) => onChange({ product_class: e.target.value as ProductClass, is_new_drug: isNewDrug })}>
          {PRODUCT_CLASSES.map((c) => <option key={c} value={c}>{PRODUCT_CLASS_LABELS[c]}</option>)}
        </select>
        {productClass === 'device' && <span className="block text-xs text-amber-700 mt-1">Medical devices are not sold online until Dawabag has a device track.</span>}
      </label>
      <label htmlFor={`${idPrefix}-newdrug`} className="flex items-center gap-2">
        <input id={`${idPrefix}-newdrug`} type="checkbox" checked={isNewDrug} disabled={disabled}
          onChange={(e) => onChange({ product_class: productClass, is_new_drug: e.target.checked })} />
        <span className="font-medium text-gray-700">New drug (NDCT Rules 2019)</span>
      </label>
      {isNewDrug && <span className="block text-xs text-gray-500">A pharmacist must add a confirmation note when allowing it for online sale.</span>}
    </div>
  );
}
