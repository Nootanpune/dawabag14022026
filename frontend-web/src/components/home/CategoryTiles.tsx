'use client';
import { LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';
import { categoryIcon } from '@/lib/shop/categoryIcon';

export interface Category {
  category: string | null;
  product_count: number | string;
}

interface Props {
  categories: Category[];
  selected: string;
  onSelect: (category: string) => void;
}

function Tile({ label, active, onClick, Icon }: { label: string; active: boolean; onClick: () => void; Icon: typeof LayoutGrid }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-medium text-center transition-colors min-w-[5.5rem]',
        active ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-gray-200 text-gray-700 hover:border-brand-400'
      )}
    >
      <Icon className={cn('w-5 h-5', active ? 'text-white' : 'text-brand-600')} aria-hidden="true" />
      <span className="line-clamp-2">{label}</span>
    </button>
  );
}

/** Category filter as icon tiles (categories from GET /products/categories). */
export default function CategoryTiles({ categories, selected, onSelect }: Props) {
  const named = categories.filter((c): c is Category & { category: string } => !!c.category);
  if (named.length === 0) return null;
  return (
    <section aria-labelledby="category-heading" className="mb-6">
      <h2 id="category-heading" className="text-base font-semibold text-gray-900 mb-2">
        Shop by category
      </h2>
      <div className="flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-4 lg:grid-cols-6 sm:overflow-visible">
        <Tile label="All" Icon={LayoutGrid} active={!selected} onClick={() => onSelect('')} />
        {named.map((c) => (
          <Tile
            key={c.category}
            label={c.category}
            Icon={categoryIcon(c.category)}
            active={selected === c.category}
            onClick={() => onSelect(selected === c.category ? '' : c.category)}
          />
        ))}
      </div>
    </section>
  );
}
