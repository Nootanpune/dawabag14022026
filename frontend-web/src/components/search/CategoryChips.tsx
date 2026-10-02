'use client';
import { cn } from '@/lib/utils';
import type { Category } from '@/components/home/CategoryTiles';

interface Props {
  categories: Category[];
  selected: string;
  onSelect: (category: string) => void;
}

/** Narrow the results to one category (categories from GET /products/categories). */
export default function CategoryChips({ categories, selected, onSelect }: Props) {
  const named = categories.filter((c): c is Category & { category: string } => !!c.category);
  if (!named.length) return null;
  const chip = (label: string, value: string) => {
    const active = selected === value;
    return (
      <button
        key={label}
        type="button"
        aria-pressed={active}
        onClick={() => onSelect(active && value ? '' : value)}
        className={cn('shrink-0 rounded-full border px-3 py-1 text-sm font-medium transition-colors',
          active ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-gray-300 text-gray-700 hover:border-brand-400')}
      >
        {label}
      </button>
    );
  };
  return (
    <div role="group" aria-label="Filter by category" className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
      {chip('All categories', '')}
      {named.map((c) => chip(c.category, c.category))}
    </div>
  );
}
