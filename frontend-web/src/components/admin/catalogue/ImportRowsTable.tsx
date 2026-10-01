'use client';
import { useState } from 'react';
import type { ImportRow } from '@/lib/admin/catalogueImport';
import StatusBadge from '@/components/admin/StatusBadge';

const ACTION_TONE: Record<string, string> = { create: 'approved', update: 'processed', unchanged: 'closed', error: 'failed' };

function describe(r: ImportRow, kind: 'products' | 'batches'): string {
  const rec = r.record ?? {};
  if (kind === 'products') return String(rec.name ?? '');
  return [rec.batch_number && `Batch ${rec.batch_number}`, rec.quantity && `qty ${rec.quantity}`, rec.expiry_date && `exp ${rec.expiry_date}`]
    .filter(Boolean)
    .join(' · ');
}

/** Per-row result of the preview, with errors and warnings. */
export default function ImportRowsTable({ rows, kind }: { rows: ImportRow[]; kind: 'products' | 'batches' }) {
  const [onlyIssues, setOnlyIssues] = useState(false);
  const shown = onlyIssues ? rows.filter((r) => r.errors.length || r.warnings.length) : rows;
  return (
    <div>
      <label className="flex items-center gap-2 text-xs text-gray-600 mb-2">
        <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} /> Show only rows with errors or warnings
      </label>
      <div className="card overflow-x-auto p-0 max-h-[480px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
              <th className="font-medium px-3 py-2">Row</th>
              <th className="font-medium px-3 py-2">SKU</th>
              <th className="font-medium px-3 py-2">Result</th>
              <th className="font-medium px-3 py-2">{kind === 'products' ? 'Product' : 'Batch'}</th>
              <th className="font-medium px-3 py-2">Errors / warnings</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={`${r.row}-${r.sku}`} className={`border-b border-gray-50 align-top ${r.action === 'error' ? 'bg-red-50/40' : ''}`}>
                <td className="px-3 py-2 text-xs text-gray-500">{r.row}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.sku || '—'}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={ACTION_TONE[r.action] ?? r.action} label={r.action} />
                </td>
                <td className="px-3 py-2 text-xs">{describe(r, kind) || '—'}</td>
                <td className="px-3 py-2 text-xs">
                  {r.errors.map((e) => (
                    <p key={e} className="text-red-600">{e}</p>
                  ))}
                  {r.warnings.map((w) => (
                    <p key={w} className="text-amber-700">{w}</p>
                  ))}
                </td>
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-xs text-gray-400">
                  No rows
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
