import type { ReactNode } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

interface Action {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface Props {
  icon: LucideIcon;
  title: string;
  hint?: ReactNode;
  action?: Action;
  /** headings level for the title; empty states inside a page section use h2/h3 */
  as?: 'h1' | 'h2' | 'h3';
}

/** Friendly empty state: an icon, what happened and the next thing to do. */
export default function EmptyState({ icon: Icon, title, hint, action, as: Heading = 'h2' }: Props) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-4">
      <div className="w-16 h-16 rounded-2xl bg-brand-50 flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-brand-600" aria-hidden="true" />
      </div>
      <Heading className="text-lg font-semibold text-gray-800">{title}</Heading>
      {hint && <p className="text-sm text-gray-500 mt-1 max-w-sm">{hint}</p>}
      {action &&
        (action.href ? (
          <Link href={action.href} className="btn-primary mt-5">
            {action.label}
          </Link>
        ) : (
          <button type="button" onClick={action.onClick} className="btn-primary mt-5">
            {action.label}
          </button>
        ))}
    </div>
  );
}
