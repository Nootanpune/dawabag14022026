'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { dispatchShipment, partnerKeys } from '@/lib/partner/api';
import type { PartnerShipment } from '@/lib/partner/types';
import { coldChainError, dispatchError, withColdChain } from '@/lib/fulfilment/handover';
import { getApiErrorMessage } from '@/lib/apiErrors';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';
import SealNumberField from '@/components/delivery/SealNumberField';
import ColdChainFields from '@/components/delivery/ColdChainFields';

// Sealed, tamper-evident pack; the seal number is recorded at dispatch (C-26).

export default function DispatchDialog({ shipment, onClose }: { shipment: PartnerShipment; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [courier, setCourier] = useState('');
  const [awb, setAwb] = useState('');
  const [seal, setSeal] = useState('');
  const [cold, setCold] = useState({ temp: '', logger: '' });
  const [error, setError] = useState('');

  const dispatch = useMutation({
    mutationFn: () =>
      dispatchShipment(shipment.id, withColdChain({ courier_partner: courier.trim(), awb_number: awb.trim(), seal_number: seal.trim() }, shipment.cold_chain, cold)),
    onSuccess: () => {
      toast.success(`${shipment.invoice_number ?? shipment.order_number} dispatched`);
      onClose();
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not mark as dispatched')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['partner', 'shipments'] }),
  });

  const submit = () => {
    // Cold-chain packs need temperature (2–8 °C) and logger ID (C-25)
    const e = dispatchError({ courier_partner: courier, awb_number: awb, seal_number: seal }) || (shipment.cold_chain ? coldChainError(cold) : '');
    if (e) return setError(e);
    setError('');
    dispatch.mutate();
  };

  return (
    <Modal title={`Dispatch ${shipment.order_number}`} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Courier</span>
          <input value={courier} onChange={(e) => setCourier(e.target.value)} className="input" autoFocus />
        </label>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">AWB / tracking number</span>
          <input value={awb} onChange={(e) => setAwb(e.target.value)} className="input" />
        </label>
        <SealNumberField value={seal} onChange={setSeal} />
        {shipment.cold_chain && <ColdChainFields value={cold} onChange={setCold} />}
      </div>
      <DialogActions onCancel={onClose} onConfirm={submit} confirmLabel="Mark dispatched" pending={dispatch.isPending} error={error} />
    </Modal>
  );
}
