import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export interface Crumb { label: string; href?: string }

/** Where this page sits (laptop and larger; phones use the header's Back arrow). */
export default function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="hidden md:block mb-3">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-gray-600">
        {items.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />}
            {c.href && i < items.length - 1
              ? <Link href={c.href} className="hover:text-brand-700 hover:underline">{c.label}</Link>
              : <span aria-current={i === items.length - 1 ? 'page' : undefined} className="text-gray-900 font-medium line-clamp-1">{c.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
