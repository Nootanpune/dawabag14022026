'use client';
import { X } from 'lucide-react';
import type { PlannedPhoto } from '@/lib/admin/bulkPhotos/plan';

interface Props {
  plan: PlannedPhoto[];
  onRemove: (id: string) => void;
  disabled?: boolean;
}

const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`;

/** Before upload: which SKU each file maps to, and which files will not be sent. */
export default function BulkPhotoPlanTable({ plan, onRemove, disabled }: Props) {
  return (
    <div className="card overflow-x-auto p-0 max-h-[420px] overflow-y-auto">
      <table className="w-full text-sm" aria-label="Photos to upload">
        <thead className="sticky top-0 bg-white">
          <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
            <th className="font-medium px-3 py-2">File</th>
            <th className="font-medium px-3 py-2">SKU</th>
            <th className="font-medium px-3 py-2">Size</th>
            <th className="font-medium px-3 py-2">Check</th>
            <th className="px-3 py-2"><span className="sr-only">Remove</span></th>
          </tr>
        </thead>
        <tbody>
          {plan.map((p) => (
            <tr key={p.id} className={`border-b border-gray-50 ${p.problem ? 'bg-red-50/40' : ''}`}>
              <td className="px-3 py-2 text-xs break-all">{p.name}</td>
              <td className="px-3 py-2 font-mono text-xs">{p.sku ?? '—'}</td>
              <td className="px-3 py-2 text-xs text-gray-500">{kb(p.file.size)}</td>
              <td className={`px-3 py-2 text-xs ${p.problem ? 'text-red-600' : 'text-green-700'}`}>{p.problem ?? 'Ready'}</td>
              <td className="px-3 py-2 text-right">
                <button
                  type="button"
                  className="p-1 text-gray-400 hover:text-red-600"
                  aria-label={`Remove ${p.name}`}
                  disabled={disabled}
                  onClick={() => onRemove(p.id)}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
