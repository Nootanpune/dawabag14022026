'use client';
import { AlertTriangle, CheckCircle2, Info, Link2, PackagePlus } from 'lucide-react';
import { formatDateIST } from '@/lib/dates';
import { MATCH_LABEL, type ImportRow } from '@/lib/partner/stockImport';
import { formatPrice } from '@/lib/utils';

interface Props {
  row: ImportRow;
  editable: boolean;
  onChoose?: (row: ImportRow) => void;
  onRequest?: (row: ImportRow) => void;
  onUnlink?: (row: ImportRow) => void;
}

/** One stock line: what the file says, which Dawabag product it is, and why it is (not) ready. */
export default function ImportRowCard({ row, editable, onChoose, onRequest, onUnlink }: Props) {
  const p = row.parsed;
  const facts = p
    ? [
        p.pack && `Pack ${p.pack}`,
        p.manufacturer && `Co. ${p.manufacturer}`,
        p.batch_number ? `Batch ${p.batch_number}` : null,
        p.expiry_date ? `Exp ${formatDateIST(p.expiry_date)}` : p.expiry_raw ? `Exp "${p.expiry_raw}"` : null,
        p.total_quantity !== null && `Qty ${p.total_quantity}`,
        p.mrp_paise !== null && `MRP ${formatPrice(p.mrp_paise)}`,
      ].filter(Boolean)
    : [];

  return (
    <li className="px-4 py-3 space-y-1.5" data-testid="import-row">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="font-medium text-sm text-gray-900">
          {p?.item_name ?? '(no item name)'}
          {p?.filled_down && <span className="ml-2 text-xs font-normal text-gray-400">next batch</span>}
        </p>
        <span className="text-xs text-gray-400">Row {row.row_number}</span>
      </div>
      {facts.length > 0 && <p className="text-xs text-gray-600">{facts.join(' · ')}</p>}

      {row.product_id && (
        <p className="text-xs text-green-800 flex items-start gap-1">
          <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            Dawabag: <strong>{row.product_name}</strong>
            {row.product_pack ? ` (${row.product_pack})` : ''}
            {row.match_method ? ` — ${MATCH_LABEL[row.match_method]}` : ''}
            {!row.listed && ' · new listing'}
          </span>
        </p>
      )}
      {row.problems.map((m) => (
        <p key={m} className="text-xs text-red-700 flex items-start gap-1">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {m}
        </p>
      ))}
      {row.warnings.map((m) => (
        <p key={m} className="text-xs text-gray-500 flex items-start gap-1">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {m}
        </p>
      ))}
      {row.new_product_requested && !row.product_id && (
        <p className="text-xs text-blue-800 bg-blue-50 rounded px-2 py-1 inline-block">
          Requested as a new product — Dawabag will add it and link it; it then matches on your next upload.
        </p>
      )}

      {editable && (
        <div className="flex flex-wrap gap-2 pt-1">
          {!row.product_id && row.item_key && (
            <button onClick={() => onChoose?.(row)} className="btn-outline text-xs py-1 px-3 inline-flex items-center gap-1">
              <Link2 className="w-3.5 h-3.5" /> Choose the Dawabag product
            </button>
          )}
          {!row.product_id && row.item_key && !row.new_product_requested && (
            <button onClick={() => onRequest?.(row)} className="btn-outline text-xs py-1 px-3 inline-flex items-center gap-1">
              <PackagePlus className="w-3.5 h-3.5" /> Request as new product
            </button>
          )}
          {row.product_id && (row.match_method === 'manual' || row.match_method === 'item_link') && (
            <button onClick={() => onUnlink?.(row)} className="text-xs text-gray-500 underline">
              Wrong product? Remove the link
            </button>
          )}
        </div>
      )}
    </li>
  );
}
