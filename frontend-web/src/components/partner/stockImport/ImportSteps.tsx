import { cn } from '@/lib/utils';

const STEPS = ['Upload', 'Columns', 'Check lines', 'Applied'];

/** Where the partner is in the import (0-based step). */
export default function ImportSteps({ step }: { step: number }) {
  return (
    <ol className="flex gap-1 text-xs mb-4" aria-label="Steps">
      {STEPS.map((s, i) => (
        <li key={s} aria-current={i === step ? 'step' : undefined}
          className={cn('flex-1 text-center rounded-full px-2 py-1 border',
            i < step ? 'bg-brand-50 border-brand-200 text-brand-700'
              : i === step ? 'bg-brand-600 border-brand-600 text-white font-medium' : 'border-gray-200 text-gray-400')}>
          {i + 1}. {s}
        </li>
      ))}
    </ol>
  );
}
