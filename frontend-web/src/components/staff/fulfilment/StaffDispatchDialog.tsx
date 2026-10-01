'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { dispatchOwnShipment, fulfilmentKeys } from '@/lib/fulfilment/api';
import type { QueueShipment } from '@/lib/fulfilment/types';
import { coldChainError, dispatchError, withColdChain } from '@/lib/fulfilment/handover';
import { getApiErrorMessage } from '@/lib/apiErrors';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';
import SealNumberField from '@/components/delivery/SealNumberField';
import ColdChainFields from '@/components/delivery/ColdChainFields';

// Dispatch writes the H1 register rows for prescription lines (C-09); the server
// refuses (409) if a line is not Rx-cleared or its batch is recalled (C-28).
// Every pack leaves sealed; the seal number is recorded (C-26).
// A courier booked through the server already has an AWB: courier and AWB may then
// be left blank and the server uses the stored ones (the seal is still required).
export default function StaffDispatchDialog({ shipment, onClose }: { shipment: QueueShipment; onClose: () => void }) {
  const queryClient = useQueryClient();
  const booked = !!shipment.awb_number;
  const [courier, setCourier] = useState(shipment.courier_partner ?? '');
  const [awb, setAwb] = useState(shipment.awb_number ?? '');
  const [seal, setSeal] = useState('');
  const [cold, setCold] = useState({ temp: '', logger: '' });
  const [error, setError] = useState('');

  const dispatch = useMutation({
    mutationFn: () =>
      dispatchOwnShipment(
        shipment.shipment_id,
        withColdChain(
          { courier_partner: courier.trim() || undefined, awb_number: awb.trim() || undefined, seal_number: seal.trim() },
          shipment.cold_chain,
          cold
        )
      ),
    onSuccess: (r) => {
      toast.success(`${shipment.order_number} dispatched${r?.h1_register_rows ? ` · ${r.h1_register_rows} H1 register row(s)` : ''}`);
      onClose();
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not dispatch')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: fulfilmentKeys.all }),
  });

  const submit = () => {
    // Cold-chain packs need temperature (2–8 °C) and logger ID (C-25)
    const e = dispatchError({ courier_partner: courier, awb_number: awb, seal_number: seal }, booked) || (shipment.cold_chain ? coldChainError(cold) : '');
    if (e) return setError(e);
    setError('');
    dispatch.mutate();
  };

  return (
    <Modal title={`Dispatch ${shipment.order_number}`} onClose={onClose}>
      <div className="space-y-3 text-sm">
        {booked && (
          <p className="text-xs text-blue-800 bg-blue-50 rounded-lg p-2">
            Booked with {shipment.courier_partner ?? 'the courier'} · AWB {shipment.awb_number}. Courier and AWB are optional; leave them as they are.
          </p>
        )}
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Courier{booked ? ' (optional)' : ''}</span>
          <input value={courier} onChange={(e) => setCourier(e.target.value)} maxLength={50} className="input" autoFocus={!booked} />
        </label>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">AWB / tracking number{booked ? ' (optional)' : ''}</span>
          <input value={awb} onChange={(e) => setAwb(e.target.value)} maxLength={100} className="input" />
        </label>
        <SealNumberField value={seal} onChange={setSeal} />
        {shipment.cold_chain && <ColdChainFields value={cold} onChange={setCold} />}
      </div>
      <DialogActions onCancel={onClose} onConfirm={submit} confirmLabel="Mark dispatched" pending={dispatch.isPending} error={error} />
    </Modal>
  );
}
