'use client';

interface Category { category: string; product_count: number }
interface Props {
  categories: Category[];
  selected: string;
  onSelect: (cat: string) => void;
}

export default function CategoryChips({ categories, selected, onSelect }: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 mb-5 scrollbar-hide">
      <button
        onClick={() => onSelect('')}
        className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium border transition-colors
          ${!selected
            ? 'bg-brand-600 text-white border-brand-600'
            : 'bg-white text-gray-600 border-gray-200 hover:border-brand-400'}`}
      >
        All
      </button>
      {categories.map((c) => (
        <button
          key={c.category}
          onClick={() => onSelect(c.category)}
          className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium border transition-colors
            ${selected === c.category
              ? 'bg-brand-600 text-white border-brand-600'
              : 'bg-white text-gray-600 border-gray-200 hover:border-brand-400'}`}
        >
          {c.category}
        </button>
      ))}
    </div>
  );
}
