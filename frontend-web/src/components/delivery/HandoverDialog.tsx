'use client';
import { useState } from 'react';
import { buildHandover, handoverError, RECEIVER_RELATIONS, type HandoverInput } from '@/lib/fulfilment/handover';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';

interface Props {
  title: string;
  /** true / false when the server told us; undefined when the list does not say */
  codeRequired?: boolean;
  /** admins may confirm without the code, giving a reason (C-26) */
  allowOverride?: boolean;
  pending?: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: (h: HandoverInput) => void;
}

/**
 * Delivery handover (C-26): the buyer's 6-digit code and who received the
 * sealed pack. Prescription shipments need both; the server enforces it,
 * rejects a wrong code (400) and locks after 5 wrong codes (423).
 */
export default function HandoverDialog({ title, codeRequired, allowOverride, pending, error, onClose, onConfirm }: Props) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [relation, setRelation] = useState('');
  const [useOverride, setUseOverride] = useState(false);
  const [override, setOverride] = useState('');
  const [localError, setLocalError] = useState('');

  const submit = () => {
    const h = buildHandover({ code: useOverride ? '' : code, name, relation, override: useOverride ? override : null });
    const e = handoverError(h, !!codeRequired);
    if (e) return setLocalError(e);
    setLocalError('');
    onConfirm(h);
  };

  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2 mb-3">
        {codeRequired === false
          ? 'No delivery code is needed for this shipment. Recording the receiver is still good practice.'
          : 'Prescription shipments: ask the buyer for their 6-digit delivery code and hand the sealed pack only to the patient or an adult at the address.'}
      </p>
      <div className="space-y-3 text-sm">
        {!useOverride && (
          <label className="block">
            <span className="block font-medium text-gray-700 mb-1">Delivery code</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              placeholder="6 digits"
              className="input font-mono tracking-widest"
              autoFocus
            />
          </label>
        )}
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Received by (name)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className="input" />
        </label>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Relation to buyer</span>
          <select value={relation} onChange={(e) => setRelation(e.target.value)} className="input">
            <option value="">Select…</option>
            {RECEIVER_RELATIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        {allowOverride && (
          <div className="border-t border-gray-100 pt-3">
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input type="checkbox" checked={useOverride} onChange={(e) => setUseOverride(e.target.checked)} />
              Confirm without the code (admin override — recorded in the audit log)
            </label>
            {useOverride && (
              <textarea
                value={override}
                onChange={(e) => setOverride(e.target.value)}
                rows={2}
                placeholder="Why is the code not available? (min 10 characters)"
                className="input mt-2"
              />
            )}
          </div>
        )}
      </div>
      <DialogActions
        onCancel={onClose}
        onConfirm={submit}
        confirmLabel="Confirm delivery"
        pending={pending}
        error={localError || error}
      />
    </Modal>
  );
}
