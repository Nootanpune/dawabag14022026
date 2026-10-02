import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { formatDateTimeIST } from '@/lib/dates';
import type { ApplyResult } from '@/lib/partner/stockImport';

/** What applying the file did to the partner's stock. */
export default function ApplyResultCard({ result, appliedAt }: { result: ApplyResult; appliedAt: string | null }) {
  const lines = [
    `${result.lines_applied} lines applied to ${result.products_updated} products`,
    `${result.batches_set} batches set (${result.packs} packs)`,
    result.batches_zeroed ? `${result.batches_zeroed} older batches not in the file set to 0` : null,
    result.listings_created ? `${result.listings_created} new listings sent to Dawabag for review` : null,
    result.not_applied.needs_review + result.not_applied.problem
      ? `${result.not_applied.needs_review + result.not_applied.problem} lines left out (needed review or had problems)` : null,
  ].filter(Boolean);
  return (
    <div className="card space-y-3 border-green-200" data-testid="apply-result">
      <p className="flex items-center gap-2 font-semibold text-green-800">
        <CheckCircle2 className="w-5 h-5" /> Stock updated{appliedAt ? ` on ${formatDateTimeIST(appliedAt)}` : ''}
      </p>
      <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">
        {lines.map((l) => <li key={l as string}>{l}</li>)}
      </ul>
      {result.skipped.length > 0 && (
        <div className="text-sm">
          <p className="font-medium text-amber-800">Not applied:</p>
          <ul className="list-disc pl-5 text-gray-700 space-y-1">
            {result.skipped.map((s) => (
              <li key={s.reason}>{s.reason} — {s.products.join(', ')}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Link href="/partner/listings" className="btn-outline text-sm">See my listings</Link>
        <Link href="/partner/stock-import" className="btn-outline text-sm">Upload another file</Link>
      </div>
    </div>
  );
}
