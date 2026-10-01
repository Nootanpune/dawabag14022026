import type { EinvoiceList } from '@/lib/einvoices/types';
import { cn } from '@/lib/utils';

const TILES = [
  { key: 'pending', label: 'Pending', tone: 'text-amber-700' },
  { key: 'failed', label: 'Failed', tone: 'text-red-700' },
  { key: 'generated', label: 'Generated', tone: 'text-green-700' },
] as const;

/** Counts by status across all e-invoices (counted by the server). */
export default function EinvoiceCounts({ counts }: { counts: EinvoiceList['counts'] }) {
  return (
    <div className="grid grid-cols-3 gap-3 mb-4 max-w-lg">
      {TILES.map((t) => {
        const n = counts[t.key] ?? 0;
        return (
          <div key={t.key} className={cn('card py-3', t.key === 'failed' && n > 0 && 'border-red-200')}>
            <p className="text-xs text-gray-500">{t.label}</p>
            <p className={cn('text-lg font-semibold', n > 0 ? t.tone : 'text-gray-900')}>{n}</p>
          </div>
        );
      })}
    </div>
  );
}
