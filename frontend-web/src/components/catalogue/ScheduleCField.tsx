'use client';

/**
 * Drugs Rules Schedule C / C1 tick box (Sprint 34). Set by the pharmacist from the pack
 * and the Rules — never guessed. A ticked medicine is sold only by sellers holding
 * Form 21 (retail) or 21B (trade); other medicines need Form 20 / 20B (C-07, C-33).
 */
export default function ScheduleCField({ id = 'schedule-c-c1', checked, onChange, disabled, className = '' }: {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  const hint = `${id}-hint`;
  return (
    <div className={`text-sm ${className}`}>
      <label htmlFor={id} className="flex items-center gap-2">
        <input id={id} type="checkbox" checked={checked} disabled={disabled} aria-describedby={hint}
          onChange={(e) => onChange(e.target.checked)} />
        <span className="font-medium text-gray-700">Schedule C / C1 medicine</span>
      </label>
      <span id={hint} className="block text-xs text-gray-500 mt-0.5">
        Biologicals such as vaccines, sera and insulin listed in Schedule C or C1. Sold only by sellers with a Form 21 (retail) or
        21B (trade) licence; other medicines need Form 20 / 20B.
      </span>
    </div>
  );
}
