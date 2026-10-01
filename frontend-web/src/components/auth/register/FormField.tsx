import type { ReactNode } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';

export function Field({
  label,
  optional,
  error,
  hint,
  children,
}: {
  label: string;
  optional?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {optional && <span className="text-gray-400">(optional)</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

/** Wraps a registered input so typed text is upper-cased (PAN, GSTIN). */
export function upper(reg: UseFormRegisterReturn): UseFormRegisterReturn {
  return {
    ...reg,
    onChange: (e) => {
      const target = e.target as HTMLInputElement;
      target.value = target.value.toUpperCase();
      return reg.onChange(e);
    },
  };
}

