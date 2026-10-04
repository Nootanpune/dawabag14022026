'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { decidePartnerCheck, fetchPartnerPharmacists, partnerKeys } from '@/lib/partner/api';
import type { PartnerShipment } from '@/lib/partner/types';
import { getApiErrorMessage } from '@/lib/apiErrors';
import Modal from '@/components/admin/Modal';
import ShipmentLines from './ShipmentLines';
import PartnerWrittenOrders from './PartnerWrittenOrders';

type Decision = 'release' | 'hold' | 'reject';
const DONE: Record<Decision, string> = { release: 'released for packing', hold: 'put on hold', reject: 'not supplied — the order is cancelled and refunded' };

/**
 * Sprint 35 (C-08): your own registered pharmacist checks the medicines and quantities
 * and releases the shipment before it is packed. Their name and registration number
 * go on the order and in Dawabag's audit log. A refusal cancels the whole order and
 * refunds the buyer (C-37).
 */
export default function PartnerCheckDialog({ shipment: s, onClose }: { shipment: PartnerShipment; onClose: () => void }) {
  const queryClient = useQueryClient();
  const pharmacists = useQuery({ queryKey: partnerKeys.pharmacists, queryFn: fetchPartnerPharmacists });
  const [who, setWho] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const decide = useMutation({
    mutationFn: (d: Decision) => decidePartnerCheck(s.id, { decision: d, vendor_pharmacist_id: who, reason: d === 'release' ? undefined : reason.trim(), edits_seen: s.edits_count }),
    onSuccess: (_r, d) => { toast.success(`${s.order_number} ${DONE[d]}`); onClose(); },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not record the decision')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['partner', 'shipments'] }),
  });
  const go = (d: Decision) => {
    if (!who) return setError('Choose the registered pharmacist who checked it.');
    if (d === 'release' && !confirmed) return setError('Tick the box to confirm the pharmacist has checked it.');
    if (d !== 'release' && reason.trim().length < 5) return setError('Write the reason (at least 5 characters).');
    setError('');
    decide.mutate(d);
  };
  const list = pharmacists.data ?? [];

  return (
    <Modal title={`Pharmacist check — ${s.order_number}`} onClose={onClose} size="lg">
      <ShipmentLines lines={s.lines} />
      {s.extra_payment_pending && (
        <p role="status" className="text-xs rounded-lg bg-amber-50 border border-amber-200 p-2 mt-3">
          The buyer changed this order and has not yet paid the difference. Release it once that payment is made.
        </p>
      )}
      {s.practitioner_order && <PartnerWrittenOrders ids={s.written_order_ids ?? []} />}
      {s.pharmacist_check === 'held' && s.pharmacist_check_note && (
        <p className="text-xs rounded-lg bg-gray-100 p-2 mt-3"><span className="font-semibold">On hold:</span> {s.pharmacist_check_note}</p>
      )}
      <label htmlFor="pc-who" className="block text-sm font-medium text-gray-700 mt-4 mb-1">Registered pharmacist who checked it</label>
      <select id="pc-who" className="input" value={who} onChange={(e) => setWho(e.target.value)}>
        <option value="">Choose…</option>
        {list.map((p) => (
          <option key={p.id} value={p.id} disabled={p.registration?.ok === false}>
            {p.full_name} — Reg. no. {p.registration_no}{p.registration?.ok === false ? ' (registration not valid)' : ''}
          </option>
        ))}
      </select>
      {/* Sprint 39 (C-03): why a pharmacist cannot release, and what to do */}
      {list.filter((p) => p.registration?.message).map((p) => (
        <p key={p.id} className={`text-xs mt-1 ${p.registration?.ok ? 'text-amber-800' : 'text-red-700'}`} data-testid="partner-registration-note">{p.registration?.message}</p>
      ))}
      {pharmacists.isSuccess && !list.length && (
        <p className="text-xs text-red-700 mt-1">No registered pharmacist is recorded for your pharmacy. Ask Dawabag to add one.</p>
      )}
      <label className="flex items-start gap-2 text-sm mt-3">
        <input type="checkbox" className="mt-1" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        <span>The pharmacist named above has checked the medicines and quantities on this shipment.</span>
      </label>
      <label htmlFor="pc-reason" className="block text-sm font-medium text-gray-700 mt-3 mb-1">Reason (needed to hold or not supply) — a hold reason is for staff only; a &ldquo;Do not supply&rdquo; reason is shown to the buyer</label>
      <textarea id="pc-reason" className="input" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      {error && <p role="alert" className="text-sm text-red-600 mt-2">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <button type="button" onClick={() => go('reject')} disabled={decide.isPending}
          className="px-4 py-2 rounded-full text-sm font-medium border border-red-600 text-red-700 hover:bg-red-50">Do not supply</button>
        {s.pharmacist_check !== 'held' && <button type="button" onClick={() => go('hold')} disabled={decide.isPending} className="btn-outline text-sm">Put on hold</button>}
        <button type="button" onClick={() => go('release')} disabled={decide.isPending} className="btn-primary text-sm flex items-center gap-2">
          {decide.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Release for packing
        </button>
      </div>
    </Modal>
  );
}
