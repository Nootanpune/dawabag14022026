'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { settingsKeys, updateSetting, type AppSetting } from '@/lib/admin/settings';
import { getApiErrorMessage } from '@/lib/apiErrors';
import Modal from '../Modal';

export const RX_HOLD_KEY = 'payments.rx_authorisation';
interface RxHold { alert_after_hours: number; release_after_hours: number; gateway_expiry_minutes: number }
const DEFAULTS: RxHold = { alert_after_hours: 48, release_after_hours: 72, gateway_expiry_minutes: 7200 };

/**
 * Prescription orders are authorised at checkout and captured after the pharmacist's check
 * (Sprint 39, C-08, C-37). Staff are alerted after the first period; an order still unchecked
 * after the second is cancelled and its hold released (never charged) — always before the
 * gateway's own window, which is sent to Razorpay with each order (max 5 days).
 */
export default function RxHoldSection({ setting, canEdit }: { setting: AppSetting | undefined; canEdit: boolean }) {
  const v = { ...DEFAULTS, ...((setting?.value as Partial<RxHold>) ?? {}) };
  const [editing, setEditing] = useState(false);
  return (
    <section className="mt-6" data-testid="rx-hold-settings">
      <h2 className="text-base font-semibold mb-2">Prescription orders: payment hold</h2>
      <div className="card text-sm space-y-1">
        <p>Staff alerted after <strong>{v.alert_after_hours} h</strong>; unchecked orders cancelled and released after <strong>{v.release_after_hours} h</strong>;
          Razorpay&apos;s capture window <strong>{Math.round(v.gateway_expiry_minutes / 60)} h</strong>.</p>
        <p className="text-xs text-gray-500">The buyer is never charged for an order the pharmacist refuses or does not check in time. Razorpay returns an uncaptured hold by itself when its window ends.</p>
        {canEdit && <button type="button" onClick={() => setEditing(true)} className="btn-outline text-xs py-1.5 px-3 mt-2">Edit</button>}
      </div>
      {editing && <RxHoldEditor value={v} onClose={() => setEditing(false)} />}
    </section>
  );
}

function RxHoldEditor({ value, onClose }: { value: RxHold; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(value);
  const save = useMutation({
    mutationFn: () => updateSetting(RX_HOLD_KEY, draft),
    onSuccess: () => { toast.success('Payment hold updated'); onClose(); },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Could not update the payment hold')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: settingsKeys.all }),
  });
  const field = (key: keyof RxHold, label: string, hint: string) => (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span><span className="block font-medium text-gray-700">{label}</span><span className="block text-xs text-gray-500">{hint}</span></span>
      <input type="number" className="input w-28" value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })} />
    </label>
  );
  return (
    <Modal title="Prescription orders: payment hold" onClose={onClose}>
      <div className="space-y-3">
        {field('alert_after_hours', 'Alert staff after (hours)', 'Before the release')}
        {field('release_after_hours', 'Cancel and release after (hours)', 'At least 2 hours before the gateway window ends')}
        {field('gateway_expiry_minutes', 'Razorpay capture window (minutes)', '1440–7200 (Razorpay allows at most 5 days)')}
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button type="button" onClick={onClose} className="btn-outline text-sm">Cancel</button>
        <button type="button" onClick={() => save.mutate()} disabled={save.isPending} className="btn-primary text-sm">Save</button>
      </div>
    </Modal>
  );
}
