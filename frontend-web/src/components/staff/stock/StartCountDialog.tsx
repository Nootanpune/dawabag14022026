'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { startCount } from '@/lib/stock/api';
import type { CatalogueHit } from '@/lib/purchasing/productSearch';
import { getApiErrorMessage } from '@/lib/apiErrors';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';
import CatalogueSearch from '@/components/admin/purchasing/CatalogueSearch';

/** Snapshot the system quantity of every batch in scope (a rack, some products, or everything). */
export default function StartCountDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('');
  const [location, setLocation] = useState('');
  const [products, setProducts] = useState<CatalogueHit[]>([]);
  const [error, setError] = useState('');
  const start = useMutation({
    mutationFn: startCount,
    onSuccess: (c) => {
      toast.success(`${c.count_no} started · ${c.lines} batch(es) to count`);
      queryClient.invalidateQueries({ queryKey: ['stock', 'counts'] });
      router.push(`/staff/stock-counts/${c.id}`);
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not start the count')),
  });

  const submit = () => {
    if (label.trim().length < 2) return setError('Give the count a name, e.g. "Rack A monthly"');
    setError('');
    start.mutate({
      label: label.trim(),
      ...(location.trim() && { storage_location: location.trim() }),
      ...(products.length && { product_ids: products.map((p) => p.id) }),
    });
  };

  return (
    <Modal title="Start a stock count" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Name</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={100} className="input" autoFocus />
        </label>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Storage location starts with (optional)</span>
          <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={100} placeholder="e.g. A-" className="input" />
        </label>
        <div>
          <span className="block font-medium text-gray-700 mb-1">Only these products (optional)</span>
          <div className="flex flex-wrap gap-1 mb-2">
            {products.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1 text-xs bg-gray-100 rounded-full pl-2 pr-1 py-0.5">
                {p.name}
                <button type="button" onClick={() => setProducts((ps) => ps.filter((x) => x.id !== p.id))} aria-label={`Remove ${p.name}`}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <CatalogueSearch taken={products.map((p) => p.id)} onPick={(p) => setProducts((ps) => [...ps, p])} placeholder="Search products" />
        </div>
        <p className="text-xs text-gray-400">Leave both empty to count every batch with stock.</p>
      </div>
      <DialogActions onCancel={onClose} onConfirm={submit} confirmLabel="Start count" pending={start.isPending} error={error} />
    </Modal>
  );
}
