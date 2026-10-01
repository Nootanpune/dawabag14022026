import type { ImportSummary } from '@/lib/admin/catalogueImport';

const tile = (label: string, n: number, tone: string) => (
  <div key={label} className={`rounded-lg border px-3 py-2 ${tone}`}>
    <p className="text-xs">{label}</p>
    <p className="text-lg font-semibold">{n}</p>
  </div>
);

/** Counts of what the import will do (or did). */
export default function ImportSummaryTiles({ summary }: { summary: ImportSummary }) {
  const { products: p, batches: b } = summary;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-sm">
      {tile('New products', p.create, 'border-green-200 bg-green-50 text-green-800')}
      {tile('Updated products', p.update, 'border-blue-200 bg-blue-50 text-blue-800')}
      {tile('Unchanged', p.unchanged, 'border-gray-200 bg-gray-50 text-gray-700')}
      {tile('Product errors', p.error, p.error ? 'border-red-200 bg-red-50 text-red-800' : 'border-gray-200 bg-white text-gray-500')}
      {tile('New stock batches', b.create, 'border-green-200 bg-green-50 text-green-800')}
      {tile('Batch errors', b.error, b.error ? 'border-red-200 bg-red-50 text-red-800' : 'border-gray-200 bg-white text-gray-500')}
    </div>
  );
}
