'use client';
import { Copy, Trash2 } from 'lucide-react';
import type { ReceiptLineDraft } from '@/lib/purchasing/receiptForm';
import { todayIST } from '@/lib/dates';

interface Props {
  index: number;
  line: ReceiptLineDraft;
  onChange: (patch: Partial<ReceiptLineDraft>) => void;
  onRemove: () => void;
  /** add another batch of the same PO line */
  onSplit?: () => void;
}

type Field = { key: keyof ReceiptLineDraft; label: string; type?: string; mode?: 'numeric' | 'decimal'; hint?: string };
const FIELDS: Field[] = [
  { key: 'batch_number', label: 'Batch no. *' },
  { key: 'expiry_date', label: 'Expiry *', type: 'date' },
  { key: 'manufactured_date', label: 'Mfg date', type: 'date' },
  { key: 'quantity', label: 'Qty (billed) *', mode: 'numeric' },
  { key: 'free_quantity', label: 'Free qty', mode: 'numeric' },
  { key: 'unit_cost', label: 'Unit cost ₹ *', mode: 'decimal', hint: 'excl. GST' },
  // C-16: printed MRP must not be below any Dawabag selling price — checked by the server
  { key: 'mrp', label: 'Printed MRP ₹ *', mode: 'decimal', hint: 'as on the pack' },
];

export default function ReceiptLineFields({ index, line, onChange, onRemove, onSplit }: Props) {
  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="text-sm font-medium">
            {index + 1}. {line.product_name}
          </p>
          <p className="text-xs text-gray-400">
            {line.sku}
            {line.remaining != null && ` · ${line.remaining} due on PO`}
          </p>
        </div>
        <div className="flex gap-1">
          {onSplit && (
            <button type="button" onClick={onSplit} className="p-1.5 text-gray-400 hover:text-brand-600" title="Another batch of this item">
              <Copy className="w-4 h-4" />
            </button>
          )}
          <button type="button" onClick={onRemove} className="p-1.5 text-gray-400 hover:text-red-600" aria-label="Remove line">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="block text-xs">
            <span className="block text-gray-500 mb-0.5">{f.label}</span>
            <input
              type={f.type ?? 'text'}
              inputMode={f.mode}
              max={f.key === 'manufactured_date' ? todayIST() : undefined}
              value={String(line[f.key] ?? '')}
              onChange={(e) => onChange({ [f.key]: e.target.value })}
              className="input"
            />
            {f.hint && <span className="text-[11px] text-gray-400">{f.hint}</span>}
          </label>
        ))}
      </div>
    </div>
  );
}
