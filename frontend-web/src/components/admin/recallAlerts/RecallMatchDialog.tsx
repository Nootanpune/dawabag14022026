'use client';
import { useState } from 'react';
import { recallMatch } from '@/lib/recallAlerts/api';
import type { AlertLine, AlertMatch } from '@/lib/recallAlerts/types';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';
import { useAlertDecision } from './useAlertDecision';

interface Props {
  line: AlertLine;
  match: AlertMatch;
  onClose: () => void;
}

/**
 * Confirms a recall from a regulator alert (C-28): every spelling of the batch we
 * hold is blocked from sale, packing and dispatch, and buyers are told to stop using it.
 */
export default function RecallMatchDialog({ line, match, onClose }: Props) {
  const [error, setError] = useState('');
  const recall = useAlertDecision(() => recallMatch(match.id), {
    success: `${match.product_name} recalled`,
    onDone: onClose,
    onError: setError,
  });
  const batches = match.batch_numbers?.length ? match.batch_numbers : [line.batch_number];

  return (
    <Modal title="Recall this product?" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <dl className="grid grid-cols-3 gap-x-3 gap-y-1">
          <dt className="text-gray-500">Product</dt>
          <dd className="col-span-2 font-medium">{match.product_name}</dd>
          {match.manufacturer && (
            <>
              <dt className="text-gray-500">Manufacturer</dt>
              <dd className="col-span-2">{match.manufacturer}</dd>
            </>
          )}
          <dt className="text-gray-500">Our batch</dt>
          <dd className="col-span-2 font-mono">{batches.join(', ')}</dd>
          <dt className="text-gray-500">Units held</dt>
          <dd className="col-span-2">{match.units_held ?? 0}</dd>
          <dt className="text-gray-500">Units sold</dt>
          <dd className="col-span-2">{match.units_sold ?? 0}</dd>
          <dt className="text-gray-500">On the alert</dt>
          <dd className="col-span-2">
            {line.drug_name} · <span className="font-mono">{line.batch_number}</span>
            {line.reason && <span className="block text-xs text-gray-500">{line.reason}</span>}
          </dd>
        </dl>
        <p className="text-xs text-red-800 bg-red-50 rounded-lg p-2">
          This cannot be undone. The batch is blocked from sale, packing and dispatch at Dawabag and partners, and every buyer who
          received it is told to stop using it.
        </p>
      </div>
      <DialogActions onCancel={onClose} onConfirm={() => recall.mutate(undefined)} confirmLabel="Recall batch" pending={recall.isPending} danger error={error} />
    </Modal>
  );
}
