'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { BulkPhotoResult } from '@/lib/admin/bulkPhotos/api';
import StatusBadge from '@/components/admin/StatusBadge';

const TONE: Record<string, string> = { uploaded: 'approved', skipped: 'pending', failed: 'failed' };

/** After upload: one row per file with the server's verdict. */
export default function BulkPhotoResultsTable({ results }: { results: BulkPhotoResult[] }) {
  const [onlyIssues, setOnlyIssues] = useState(false);
  const count = (s: string) => results.filter((r) => r.status === s).length;
  const shown = onlyIssues ? results.filter((r) => r.status !== 'uploaded') : results;
  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-700">
        {count('uploaded')} uploaded · {count('skipped')} skipped · {count('failed')} failed
      </p>
      <label className="flex items-center gap-2 text-xs text-gray-600">
        <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} /> Show only skipped and failed files
      </label>
      <div className="card overflow-x-auto p-0 max-h-[480px] overflow-y-auto">
        <table className="w-full text-sm" aria-label="Upload results">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
              <th className="font-medium px-3 py-2">File</th>
              <th className="font-medium px-3 py-2">SKU</th>
              <th className="font-medium px-3 py-2">Result</th>
              <th className="font-medium px-3 py-2">Message</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={`${r.file}-${i}`} className="border-b border-gray-50 align-top">
                <td className="px-3 py-2 text-xs break-all">{r.file}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  {r.product_id ? (
                    <Link href={`/admin/products/${r.product_id}`} className="text-brand-700 hover:underline">
                      {r.sku}
                    </Link>
                  ) : (
                    r.sku ?? '—'
                  )}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={TONE[r.status] ?? r.status} label={r.status} />
                </td>
                <td className="px-3 py-2 text-xs">{r.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
