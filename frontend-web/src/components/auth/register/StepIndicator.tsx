import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  steps: string[];
  /** zero-based index of the current step */
  current: number;
}

export default function StepIndicator({ steps, current }: Props) {
  return (
    <div className="mb-6">
      <ol className="flex items-center">
        {steps.map((label, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={label} className={cn('flex items-center', i < steps.length - 1 && 'flex-1')}>
              <div className="flex flex-col items-center gap-1">
                <span
                  className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2',
                    done && 'bg-brand-600 border-brand-600 text-white',
                    active && 'border-brand-600 text-brand-600 bg-white',
                    !done && !active && 'border-gray-300 text-gray-400 bg-white'
                  )}
                  aria-current={active ? 'step' : undefined}
                >
                  {done ? <Check className="w-4 h-4" /> : i + 1}
                </span>
                <span
                  className={cn(
                    'text-[11px] whitespace-nowrap',
                    active ? 'text-brand-700 font-medium' : 'text-gray-500'
                  )}
                >
                  {label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className={cn('flex-1 h-0.5 mx-2 mb-5', done ? 'bg-brand-600' : 'bg-gray-200')} />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
