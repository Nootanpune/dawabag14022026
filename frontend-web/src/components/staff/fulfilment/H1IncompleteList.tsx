'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { completePrescriber, fetchH1Incomplete, registerKeys, type H1Incomplete } from '@/lib/registers/api';
import { fulfilmentKeys } from '@/lib/fulfilment/api';
import { getApiErrorMessage } from '@/lib/apiErrors';

/**
 * Prescriptions checked before Sprint 38 whose Schedule H1 lines cannot be dispatched
 * until the prescriber's address is recorded (C-09). Only empty details can be filled
 * in; everything else on a verified prescription stays as it was (C-08).
 */
export default function H1IncompleteList() {
  const { data } = useQuery({ queryKey: registerKeys.incomplete, queryFn: fetchH1Incomplete });
  if (!data?.length) return null;
  return (
    <section aria-labelledby="h1-incomplete" className="rounded-xl border border-amber-300 bg-amber-50 p-4">
      <h2 id="h1-incomplete" className="text-sm font-semibold text-gray-900">Prescriptions missing H1 details</h2>
      <p className="text-xs text-gray-700 mb-3">
        These Schedule H1 parcels cannot be dispatched until the Schedule H1 register has the prescriber&apos;s address. Copy it from the prescription.
      </p>
      <ul className="space-y-3">
        {data.map((p) => <IncompleteRow key={p.prescription_id} item={p} />)}
      </ul>
    </section>
  );
}

function IncompleteRow({ item }: { item: H1Incomplete }) {
  const queryClient = useQueryClient();
  const [address, setAddress] = useState('');
  const [regNo, setRegNo] = useState('');
  const save = useMutation({
    mutationFn: () => completePrescriber(item.prescription_id, {
      prescriber_address: address.trim(),
      ...(regNo.trim() && !item.prescriber_reg_no ? { prescriber_reg_no: regNo.trim() } : {}),
    }),
    onSuccess: () => {
      toast.success(`${item.order_number}: H1 details recorded`);
      queryClient.invalidateQueries({ queryKey: registerKeys.incomplete });
      queryClient.invalidateQueries({ queryKey: fulfilmentKeys.all });
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not save')),
  });
  const id = `addr-${item.prescription_id}`;
  return (
    <li className="bg-white rounded-lg border border-amber-200 p-3 text-sm" data-testid="h1-incomplete-row">
      <p className="font-medium">{item.order_number} · {item.products}</p>
      <p className="text-xs text-gray-600">Patient {item.patient_name ?? '—'} · Prescriber {item.prescriber_name ?? '—'} · Seller {item.sellers}</p>
      <div className="grid gap-2 sm:grid-cols-[1fr_12rem_auto] items-end mt-2">
        <label htmlFor={id} className="block text-xs">
          <span className="block font-medium text-gray-700 mb-1">Prescriber address</span>
          <input id={id} value={address} onChange={(e) => setAddress(e.target.value)} maxLength={500} className="input" />
        </label>
        {!item.prescriber_reg_no && (
          <label className="block text-xs">
            <span className="block font-medium text-gray-700 mb-1">Registration no. (if shown)</span>
            <input value={regNo} onChange={(e) => setRegNo(e.target.value)} maxLength={100} className="input" />
          </label>
        )}
        <button type="button" disabled={address.trim().length < 5 || save.isPending} onClick={() => save.mutate()}
          className="btn-primary text-sm inline-flex items-center gap-2 disabled:opacity-50">
          {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Save
        </button>
      </div>
    </li>
  );
}
