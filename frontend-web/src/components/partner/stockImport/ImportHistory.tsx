'use client';
import Link from 'next/link';
import { formatDateTimeIST } from '@/lib/dates';
import { STATUS_LABEL, type ImportListItem } from '@/lib/partner/stockImport';
import { cn } from '@/lib/utils';

const BADGE: Record<ImportListItem['status'], string> = {
  draft: 'bg-amber-50 text-amber-800 border-amber-200',
  applied: 'bg-green-50 text-green-800 border-green-200',
  cancelled: 'bg-gray-50 text-gray-500 border-gray-200',
};

/** Past uploads, newest first. */
export default function ImportHistory({ imports }: { imports: ImportListItem[] }) {
  return (
    <ul className="divide-y divide-gray-100 card p-0" aria-label="Past stock uploads">
      {imports.map((i) => (
        <li key={i.id}>
          <Link href={`/partner/stock-import/${i.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-gray-50">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm text-gray-900 truncate">{i.file_name}</p>
              <p className="text-xs text-gray-500">
                {formatDateTimeIST(i.created_at)}
                {i.source_software ? ` · ${i.source_software}` : ''}
                {i.api_key_prefix ? ` · sent by your software (${i.api_key_label ?? 'API key'})` : i.uploaded_by ? ` · ${i.uploaded_by}` : ''}
              </p>
            </div>
            <div className="text-xs text-gray-600">
              {i.status === 'applied' && i.result
                ? `${i.result.lines_applied} lines applied · ${i.result.batches_set} batches`
                : i.summary
                  ? `${i.summary.matched} matched · ${i.summary.needs_review} to review · ${i.summary.problem} problems`
                  : `${i.row_count} rows`}
            </div>
            <span className={cn('text-xs border rounded-full px-2 py-0.5', BADGE[i.status])}>{STATUS_LABEL[i.status]}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
