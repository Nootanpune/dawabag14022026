'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { decideCheck, fulfilmentKeys } from '@/lib/fulfilment/api';
import type { CheckDecision, CheckQueueItem } from '@/lib/fulfilment/types';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { CUSTOMER_TYPE_SHORT } from '@/lib/admin/format';
import { formatPrice } from '@/lib/utils';
import Modal from '@/components/admin/Modal';
import BuyerHealthNote from './BuyerHealthNote';
import CheckLinesTable from './CheckLinesTable';
import CheckSignals from './CheckSignals';
import WrittenOrderNote from './WrittenOrderNote';

const DONE: Record<CheckDecision, string> = {
  release: 'released for packing',
  hold: 'put on hold',
  reject: 'not supplied — cancelled and refunded',
};

/**
 * The pharmacist's check of one order before packing (Sprint 35, C-08): the medicines and
 * quantities, the buyer's health note (with consent, C-41) and the signals, then
 * Release for packing, Hold or Do not supply (with a reason; a refusal cancels and refunds, C-37).
 * The server records the pharmacist's name and registration number (C-46).
 */
export default function CheckDialog({ item, onClose }: { item: CheckQueueItem; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [confirmReject, setConfirmReject] = useState(false);
  const decide = useMutation({
    mutationFn: (d: CheckDecision) => decideCheck(item.shipment_id, d, d === 'release' ? undefined : reason.trim()),
    onSuccess: (_r, d) => { toast.success(`${item.order_number} ${DONE[d]}`); onClose(); },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not record the decision')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: fulfilmentKeys.all }),
  });
  const needReason = (d: CheckDecision) => {
    if (reason.trim().length < 5) { setError(d === 'hold' ? 'Write why the order is on hold (at least 5 characters).' : 'Write why it cannot be supplied (at least 5 characters).'); return; }
    if (d === 'reject' && !confirmReject) { setConfirmReject(true); setError(''); return; }
    setError('');
    decide.mutate(d);
  };
  const busy = decide.isPending;

  return (
    <Modal title={`Pharmacist check — ${item.order_number}`} onClose={onClose} size="lg">
      <p className="text-xs text-gray-600 mb-3">
        {item.buyer_name ?? 'Buyer'} · {CUSTOMER_TYPE_SHORT[item.customer_type] ?? item.customer_type}
        {item.payment_terms && item.payment_terms !== 'prepaid' ? ` · credit (${item.payment_terms.replace('_', ' ')})` : ' · paid'}
        {' · '}{formatPrice(item.total_paise)}
      </p>
      {item.pharmacist_check === 'held' && item.pharmacist_check_note && (
        <p className="text-xs rounded-lg bg-gray-100 p-2 mb-3"><span className="font-semibold">On hold:</span> {item.pharmacist_check_note}</p>
      )}
      {item.extra_payment_pending && (
        <p role="status" className="text-xs rounded-lg bg-amber-50 border border-amber-200 p-2 mb-3" data-testid="extra-payment-pending">
          The buyer changed this order and has not yet paid the difference. It can be released once that payment is made.
        </p>
      )}
      {item.customer_type === 'doc_hospital' && <WrittenOrderNote orderId={item.order_id} count={item.written_orders ?? 0} />}
      <BuyerHealthNote orderId={item.order_id} />
      <CheckLinesTable lines={item.lines} />
      <div className="mt-3"><CheckSignals signals={item.signals} /></div>

      <label htmlFor="check-reason" className="block text-sm font-medium text-gray-700 mt-4 mb-1">
        Reason (needed to hold or not supply) — a hold reason is for staff only; a &ldquo;Do not supply&rdquo; reason is shown to the buyer
      </label>
      <textarea id="check-reason" className="input" rows={2} maxLength={500} value={reason}
        onChange={(e) => { setReason(e.target.value); setConfirmReject(false); }} />
      {error && <p role="alert" className="text-sm text-red-600 mt-2">{error}</p>}
      {confirmReject && (
        <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg p-2 mt-2">
          The whole order will be cancelled and the buyer refunded the way they paid. Press &ldquo;Do not supply&rdquo; again to confirm.
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <button type="button" onClick={() => needReason('reject')} disabled={busy}
          className="px-4 py-2 rounded-full text-sm font-medium border border-red-600 text-red-700 hover:bg-red-50">
          Do not supply
        </button>
        {item.pharmacist_check !== 'held' && (
          <button type="button" onClick={() => needReason('hold')} disabled={busy} className="btn-outline text-sm">Put on hold</button>
        )}
        <button type="button" onClick={() => decide.mutate('release')} disabled={busy} className="btn-primary text-sm flex items-center gap-2">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Release for packing
        </button>
      </div>
    </Modal>
  );
}
