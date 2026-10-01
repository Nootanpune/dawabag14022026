'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fulfilmentKeys } from '@/lib/fulfilment/api';
import { reassignRider } from '@/lib/fulfilment/riders';
import type { QueueShipment } from '@/lib/fulfilment/types';
import { getApiErrorMessage } from '@/lib/apiErrors';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';
import RiderSelect from './RiderSelect';

/**
 * Hand a parcel that is out with one of our riders to another rider (Sprint 13,
 * C-26). It leaves the first rider's run sheet at once; the change is audited.
 * The server refuses (409) once the parcel is delivered.
 */
export default function ReassignRiderDialog({ shipment, onClose }: { shipment: QueueShipment; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [riderId, setRiderId] = useState('');
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: () => reassignRider(shipment.shipment_id, riderId),
    onSuccess: () => {
      toast.success(`${shipment.order_number} handed to another rider`);
      onClose();
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not reassign the parcel')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: fulfilmentKeys.all }),
  });

  const submit = () => {
    if (!riderId) return setError('Choose the rider');
    setError('');
    save.mutate();
  };

  return (
    <Modal title={`Reassign ${shipment.order_number}`} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p className="text-gray-600">
          Run reference <span className="font-mono">{shipment.awb_number}</span>
          {shipment.seal_number ? ` · Seal ${shipment.seal_number}` : ''}
        </p>
        <RiderSelect value={riderId} onChange={setRiderId} />
      </div>
      <DialogActions onCancel={onClose} onConfirm={submit} confirmLabel="Reassign" pending={save.isPending} error={error} />
    </Modal>
  );
}
