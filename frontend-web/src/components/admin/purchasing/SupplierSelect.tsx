'use client';
import { useQuery } from '@tanstack/react-query';
import { fetchSuppliers, purchasingKeys } from '@/lib/purchasing/api';

interface Props {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}

/** Only suppliers that can supply right now: approved, active, licence in date (C-02). */
export default function SupplierSelect({ value, onChange, disabled }: Props) {
  const { data, isLoading } = useQuery({ queryKey: purchasingKeys.suppliers, queryFn: fetchSuppliers });
  const usable = (data ?? []).filter((s) => s.can_supply || s.id === value);
  const blocked = (data ?? []).length - usable.length;
  return (
    <div>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled || isLoading} className="input">
        <option value="">{isLoading ? 'Loading…' : 'Select supplier'}</option>
        {usable.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} {s.drug_license_no ? `· DL ${s.drug_license_no}` : ''}
          </option>
        ))}
      </select>
      {blocked > 0 && (
        <span className="block text-xs text-gray-400 mt-1">
          {blocked} supplier(s) hidden: not approved, inactive or licence expired.
        </span>
      )}
    </div>
  );
}
