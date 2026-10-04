'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Modal from '@/components/admin/Modal';
import QueryState from '@/components/admin/QueryState';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { formatDateTimeIST } from '@/lib/dates';
import { RESTRICTION_STAFF_LABELS, type BuyerRestriction } from '@/lib/shop/buyerRestriction';
import {
  buyerRestrictionKeys, fetchBuyerRestrictionLog, restrictionProblem, setBuyerRestriction, type RestrictionChange,
} from '@/lib/buyerRestriction/api';
import BuyerRestrictionFields from './BuyerRestrictionFields';
import BuyerRestrictionBadge from './BuyerRestrictionBadge';

/**
 * Sprint 47: who may buy one product — change it (pharmacist only, with a reason) and its
 * append-only history (pharmacists and admins). The server applies it at once on every buyer path.
 */
export default function BuyerRestrictionDialog({ product, canChange, onClose }: {
  product: { id: string; name: string; buyer_restriction?: string | null };
  canChange: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const current = (product.buyer_restriction ?? 'everyone') as BuyerRestriction;
  const [value, setValue] = useState<RestrictionChange>({ restriction: current, reason: '' });
  const log = useQuery({ queryKey: buyerRestrictionKeys.log(product.id), queryFn: () => fetchBuyerRestrictionLog(product.id) });
  const problem = restrictionProblem(value, current);
  const save = useMutation({
    mutationFn: () => setBuyerRestriction(product.id, { restriction: value.restriction, reason: value.reason.trim() }),
    onSuccess: (r) => {
      toast.success(`Who may buy ${product.name}: ${RESTRICTION_STAFF_LABELS[r.buyer_restriction]}`);
      queryClient.invalidateQueries({ queryKey: buyerRestrictionKeys.all });
      queryClient.invalidateQueries({ queryKey: ['online-sale'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
      onClose();
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Could not change who may buy it')),
  });
  return (
    <Modal title={`Who may buy: ${product.name}`} onClose={onClose} size="lg">
      <p className="text-sm mb-3">Now: <BuyerRestrictionBadge value={current} /></p>
      {canChange ? (
        <>
          <BuyerRestrictionFields value={value} onChange={setValue} idPrefix={`br-${product.id}`} />
          {problem && <p className="text-xs text-amber-800 mt-2" role="status">{problem}</p>}
          <div className="flex justify-end gap-2 mt-3">
            <button type="button" onClick={onClose} className="btn-outline text-sm">Cancel</button>
            <button type="button" disabled={!!problem || save.isPending} onClick={() => save.mutate()} className="btn-primary text-sm disabled:opacity-50">Save</button>
          </div>
        </>
      ) : (
        <p className="text-xs text-gray-600">Only a Dawabag pharmacist with a valid registration decides who may buy a product.</p>
      )}
      <h3 className="text-sm font-medium mt-4 mb-1">History</h3>
      <QueryState isLoading={log.isLoading} error={log.error} isEmpty={!log.data?.length} emptyText="Never changed: everyone may buy it." />
      <ol className="space-y-2 text-sm">
        {log.data?.map((l, i) => (
          <li key={i} className="border-b border-gray-100 pb-2">
            <p className="font-medium">{l.old_restriction ? `${RESTRICTION_STAFF_LABELS[l.old_restriction]} → ` : ''}{RESTRICTION_STAFF_LABELS[l.new_restriction]}</p>
            <p className="text-xs text-gray-600">{formatDateTimeIST(l.set_at)}{l.set_by_name ? ` · ${l.set_by_name}` : ''}</p>
            <p className="text-xs text-gray-700">{l.reason}</p>
          </li>
        ))}
      </ol>
    </Modal>
  );
}
