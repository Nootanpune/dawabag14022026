'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { dispatchShipment, partnerKeys } from '@/lib/partner/api';
import type { PartnerShipment } from '@/lib/partner/types';
import { getApiErrorMessage } from '@/lib/apiErrors';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';

export default function DispatchDialog({ shipment, onClose }: { shipment: PartnerShipment; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [courier, setCourier] = useState('');
  const [awb, setAwb] = useState('');
  const [error, setError] = useState('');

  const dispatch = useMutation({
    mutationFn: () => dispatchShipment(shipment.id, { courier_partner: courier.trim(), awb_number: awb.trim() }),
    onSuccess: () => {
      toast.success(`${shipment.invoice_number ?? shipment.order_number} dispatched`);
      onClose();
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not mark as dispatched')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['partner', 'shipments'] }),
  });

  const submit = () => {
    if (!courier.trim() || !awb.trim()) return setError('Courier and AWB number are required');
    setError('');
    dispatch.mutate();
  };

  return (
    <Modal title={`Dispatch ${shipment.order_number}`} onClose={onClose}>
      {shipment.cold_chain && (
        <p className="text-xs text-blue-800 bg-blue-50 rounded-lg p-2 mb-3">
          Contains cold-chain items — pack with ice packs / insulated box.
        </p>
      )}
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Courier</span>
          <input value={courier} onChange={(e) => setCourier(e.target.value)} className="input" autoFocus />
        </label>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">AWB / tracking number</span>
          <input value={awb} onChange={(e) => setAwb(e.target.value)} className="input" />
        </label>
      </div>
      <DialogActions onCancel={onClose} onConfirm={submit} confirmLabel="Mark dispatched" pending={dispatch.isPending} error={error} />
    </Modal>
  );
}
