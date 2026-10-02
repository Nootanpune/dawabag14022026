import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  /** visible label above the field (design review: labels, not placeholders) */
  label: string;
  icon: LucideIcon;
  error?: string;
  hint?: string;
  /** text shown inside the pill before the value, e.g. +91 */
  prefix?: string;
  /** a button at the right end, e.g. show / hide password */
  trailing?: ReactNode;
}

/** A rounded (pill) field with a leading icon, as in the owner's DAWA BAG mock. */
const IconField = forwardRef<HTMLInputElement, Props>(function IconField(
  { label, icon: Icon, error, hint, prefix, trailing, id, className, ...input }, ref,
) {
  const fieldId = id ?? `f-${input.name}`;
  const msgId = `${fieldId}-msg`;
  return (
    <div>
      <label htmlFor={fieldId} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className={cn('flex items-center gap-2 rounded-full border bg-white px-4 focus-within:ring-2 focus-within:ring-brand-500',
        error ? 'border-red-400' : 'border-gray-300')}>
        <Icon className="w-4 h-4 shrink-0 text-brand-600" aria-hidden="true" />
        {prefix && <span className="text-sm text-gray-600" aria-hidden="true">{prefix}</span>}
        <input
          ref={ref}
          id={fieldId}
          aria-invalid={!!error || undefined}
          aria-describedby={error || hint ? msgId : undefined}
          className={cn('flex-1 min-w-0 bg-transparent py-2.5 text-sm outline-none placeholder-gray-400', className)}
          {...input}
        />
        {trailing}
      </div>
      {error ? <p id={msgId} className="text-xs text-red-600 mt-1">{error}</p>
        : hint ? <p id={msgId} className="text-xs text-gray-500 mt-1">{hint}</p> : null}
    </div>
  );
});

export default IconField;
