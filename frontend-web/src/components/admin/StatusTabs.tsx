'use client';
import { cn } from '@/lib/utils';

/** Horizontal tab strip for filtering a list by status. */
export default function StatusTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 border-b border-gray-200 mb-4 overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            'px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap',
            value === t.value ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
