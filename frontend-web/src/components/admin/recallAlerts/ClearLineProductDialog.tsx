'use client';
import { useState } from 'react';
import { clearLineProduct } from '@/lib/recallAlerts/api';
import type { AlertLine } from '@/lib/recallAlerts/types';
import type { ProductHit } from '@/lib/recalls/api';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';
import ProductPicker from '@/components/admin/recalls/ProductPicker';
import { useAlertDecision } from './useAlertDecision';

/**
 * A goods receipt was refused because its batch is on this alert line, for a product
 * we did not hold when the alert came in. The admin checks the product and clears it
 * for this line with a note, so the receipt can go through (C-28).
 */
export default function ClearLineProductDialog({ line, onClose }: { line: AlertLine; onClose: () => void }) {
  const [product, setProduct] = useState<ProductHit | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const clear = useAlertDecision((v: { productId: string; notes: string }) => clearLineProduct(line.id, v.productId, v.notes), {
    success: 'Product cleared for this alert line',
    onDone: onClose,
    onError: setError,
  });

  const submit = () => {
    if (!product) return setError('Pick the product that was refused at receipt');
    if (notes.trim().length < 5) return setError('Say why it is not the product on the alert (at least 5 characters)');
    setError('');
    clear.mutate({ productId: product.id, notes: notes.trim() });
  };

  return (
    <Modal title="Clear a product refused at receipt" onClose={onClose} size="lg">
      <div className="space-y-3 text-sm">
        <p className="text-gray-600">
          Alert line {line.line_no}: <span className="font-medium text-gray-900">{line.drug_name}</span> · batch{' '}
          <span className="font-mono">{line.batch_number}</span>
          {line.manufacturer ? ` · ${line.manufacturer}` : ''}
        </p>
        <div>
          <span className="block font-medium text-gray-700 mb-1">Product refused at receipt</span>
          <ProductPicker value={product} onChange={setProduct} />
        </div>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Why is it not the product on the alert?</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={2000} className="input" />
        </label>
        <p className="text-xs text-amber-800 bg-amber-50 rounded-lg p-2">
          Only clear a product you have checked is not the one named on the alert. The clearance is recorded and cannot be undone.
        </p>
      </div>
      <DialogActions onCancel={onClose} onConfirm={submit} confirmLabel="Clear product" pending={clear.isPending} error={error} />
    </Modal>
  );
}
