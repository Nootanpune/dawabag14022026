import Link from 'next/link';
import { POLICY_LABELS, type PolicyKey } from '@/lib/legal/policies';

/** Links to published policies (C-39); opens in a new tab so checkout is not lost. */
export default function PolicyLinks({
  keys,
  className = 'flex flex-wrap gap-x-4 gap-y-1 text-xs',
  newTab,
}: {
  keys: readonly PolicyKey[];
  className?: string;
  newTab?: boolean;
}) {
  return (
    <span className={className}>
      {keys.map((k) => (
        <Link
          key={k}
          href={`/policies/${k}`}
          target={newTab ? '_blank' : undefined}
          className="text-brand-600 hover:underline"
        >
          {POLICY_LABELS[k]}
        </Link>
      ))}
    </span>
  );
}
