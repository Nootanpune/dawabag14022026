import { cn } from '@/lib/utils';
import { STOCK_STATUSES, type StockStatus } from '@/lib/admin/stock';

interface Props {
  counts: Partial<Record<StockStatus, number>>;
  selected: StockStatus | '';
  onSelect: (s: StockStatus | '') => void;
}

const TONE: Record<StockStatus, string> = {
  'OUT OF STOCK': 'border-red-300 text-red-700',
  'REORDER NOW': 'border-orange-300 text-orange-700',
  'LOW STOCK': 'border-amber-300 text-amber-700',
};

export default function StockStatusChips({ counts, selected, onSelect }: Props) {
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      <button
        onClick={() => onSelect('')}
        className={cn(
          'px-3 py-1.5 rounded-full border text-sm',
          selected === '' ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-gray-300 text-gray-700'
        )}
      >
        All
      </button>
      {STOCK_STATUSES.map((s) => (
        <button
          key={s}
          onClick={() => onSelect(s)}
          className={cn(
            'px-3 py-1.5 rounded-full border text-sm bg-white',
            TONE[s],
            selected === s && 'ring-2 ring-offset-1 ring-brand-400'
          )}
        >
          {s} <span className="font-semibold">{counts[s] ?? 0}</span>
        </button>
      ))}
    </div>
  );
}
