'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { dispatchOwnShipment, fulfilmentKeys } from '@/lib/fulfilment/api';
import type { QueueShipment } from '@/lib/fulfilment/types';
import { getApiErrorMessage } from '@/lib/apiErrors';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';

// Dispatch writes the H1 register rows for prescription lines (C-09); the server
// refuses (409) if a line is not Rx-cleared or its batch is recalled (C-28).
export default function StaffDispatchDialog({ shipment, onClose }: { shipment: QueueShipment; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [courier, setCourier] = useState(shipment.courier_partner ?? '');
  const [awb, setAwb] = useState(shipment.awb_number ?? '');
  const [error, setError] = useState('');

  const dispatch = useMutation({
    mutationFn: () => dispatchOwnShipment(shipment.shipment_id, { courier_partner: courier.trim(), awb_number: awb.trim() }),
    onSuccess: (r) => {
      toast.success(`${shipment.order_number} dispatched${r?.h1_register_rows ? ` · ${r.h1_register_rows} H1 register row(s)` : ''}`);
      onClose();
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not dispatch')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: fulfilmentKeys.all }),
  });

  const submit = () => {
    if (courier.trim().length < 2) return setError('Enter the courier name');
    if (awb.trim().length < 3) return setError('Enter the AWB / tracking number');
    setError('');
    dispatch.mutate();
  };

  return (
    <Modal title={`Dispatch ${shipment.order_number}`} onClose={onClose}>
      {shipment.cold_chain && (
        <p className="text-xs text-blue-800 bg-blue-50 rounded-lg p-2 mb-3">Cold-chain items — use an insulated box with ice packs.</p>
      )}
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Courier</span>
          <input value={courier} onChange={(e) => setCourier(e.target.value)} maxLength={50} className="input" autoFocus />
        </label>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">AWB / tracking number</span>
          <input value={awb} onChange={(e) => setAwb(e.target.value)} maxLength={100} className="input" />
        </label>
      </div>
      <DialogActions onCancel={onClose} onConfirm={submit} confirmLabel="Mark dispatched" pending={dispatch.isPending} error={error} />
    </Modal>
  );
}
