import type { ImportSummary } from '@/lib/partner/stockImport';

/** Counts after the server's last check of the file. */
export default function ImportSummaryTiles({ summary }: { summary: ImportSummary }) {
  const tiles = [
    { label: 'Ready (matched)', value: summary.matched, tone: 'text-green-700' },
    { label: 'Need your review', value: summary.needs_review, tone: 'text-amber-700' },
    { label: 'Problems', value: summary.problem, tone: 'text-red-700' },
    { label: 'Products ready', value: summary.products, tone: 'text-gray-900' },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="import-summary">
      {tiles.map((t) => (
        <div key={t.label} className="card py-3">
          <p className="text-xs text-gray-500">{t.label}</p>
          <p className={`text-2xl font-semibold mt-0.5 ${t.tone}`}>{t.value}</p>
        </div>
      ))}
    </div>
  );
}
