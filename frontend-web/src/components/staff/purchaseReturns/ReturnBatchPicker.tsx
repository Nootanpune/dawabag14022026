'use client';
import type { Batch } from '@/lib/stock/types';
import { freeQty } from '@/lib/purchaseReturns/labels';
import { formatDateIST, formatPaise } from '@/lib/admin/format';
import StatusBadge from '@/components/admin/StatusBadge';

interface Props {
  batches: Batch[];
  vendorId: string;
  /** batch_id → quantity typed; a key present means the batch is ticked */
  qty: Record<string, string>;
  onChange: (qty: Record<string, string>) => void;
}

/**
 * Batches that can go back to the supplier. Free = available − reserved for orders.
 * A batch received from another supplier cannot go on this return (the server refuses it too).
 */
export default function ReturnBatchPicker({ batches, vendorId, qty, onChange }: Props) {
  const toggle = (b: Batch, on: boolean) => {
    const next = { ...qty };
    if (on) next[b.id] = String(freeQty(b));
    else delete next[b.id];
    onChange(next);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
            <th className="px-2 py-2" />
            <th className="font-medium px-2 py-2">Product</th>
            <th className="font-medium px-2 py-2">Batch / expiry</th>
            <th className="font-medium px-2 py-2 text-right">Free</th>
            <th className="font-medium px-2 py-2 text-right">Unit cost</th>
            <th className="font-medium px-2 py-2 text-right">Return qty</th>
            <th className="font-medium px-2 py-2 text-right">Cost value</th>
          </tr>
        </thead>
        <tbody>
          {batches.map((b) => {
            const free = freeQty(b);
            const otherSupplier = !!b.vendor_id && b.vendor_id !== vendorId;
            const disabled = free <= 0 || otherSupplier;
            const ticked = b.id in qty;
            const q = Number(qty[b.id]);
            const value = ticked && Number.isInteger(q) && q > 0 ? q * (b.purchase_price_paise ?? 0) : null;
            return (
              <tr key={b.id} className={`border-b border-gray-50 align-top ${disabled ? 'opacity-50' : ''}`}>
                <td className="px-2 py-2">
                  <input
                    type="checkbox"
                    checked={ticked}
                    disabled={disabled && !ticked}
                    onChange={(e) => toggle(b, e.target.checked)}
                    aria-label={`Return ${b.product_name} batch ${b.batch_number}`}
                  />
                </td>
                <td className="px-2 py-2">
                  <p className="font-medium">{b.product_name}</p>
                  <p className="text-xs text-gray-400">
                    {b.sku}
                    {otherSupplier && ` · from ${b.supplier_name ?? 'another supplier'}`}
                  </p>
                </td>
                <td className="px-2 py-2 text-xs">
                  <p className="font-mono">{b.batch_number}</p>
                  <p className="text-gray-400">{formatDateIST(b.expiry_date)}</p>
                  {b.is_recalled ? (
                    <StatusBadge status="recalled" />
                  ) : b.days_to_expiry <= 0 ? (
                    <StatusBadge status="expired" />
                  ) : (
                    <span className="text-gray-500">{b.days_to_expiry} days left</span>
                  )}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {free}
                  {b.quantity_reserved > 0 && <p className="text-xs text-gray-400">{b.quantity_reserved} reserved</p>}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-xs">{formatPaise(b.purchase_price_paise)}</td>
                <td className="px-2 py-2 text-right">
                  {ticked && (
                    <input
                      value={qty[b.id]}
                      onChange={(e) => onChange({ ...qty, [b.id]: e.target.value })}
                      inputMode="numeric"
                      className="input w-20 text-right py-1"
                      aria-label="Quantity to return"
                    />
                  )}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-xs">{value == null ? '—' : formatPaise(value)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
