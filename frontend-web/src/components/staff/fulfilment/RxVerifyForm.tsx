'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { fulfilmentKeys, rejectPrescription, verifyPrescription } from '@/lib/fulfilment/api';
import type { StaffOrder } from '@/lib/fulfilment/types';
import { getApiErrorMessage, getApiFieldErrors } from '@/lib/apiErrors';
import ReasonDialog from '@/components/admin/ReasonDialog';
import RxLinesTable from './RxLinesTable';
import { emptyDraft, rxLinesFor, toVerifyBody, type RxDraft } from './rxForm';
import { todayIST } from '@/lib/dates';

interface Props {
  order: StaffOrder;
  prescriptionId: string;
  onDone: () => void;
}

// Pharmacist records prescriber, patient and allowed quantities (C-03, C-08, C-09).
export default function RxVerifyForm({ order, prescriptionId, onDone }: Props) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<RxDraft>(() => emptyDraft(order.delivery_name ?? order.customer_name ?? '', rxLinesFor(order.items)));
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState(false);
  const set = (patch: Partial<RxDraft>) => setDraft({ ...draft, ...patch });
  const refresh = () => queryClient.invalidateQueries({ queryKey: fulfilmentKeys.all });

  const verify = useMutation({
    mutationFn: (body: Parameters<typeof verifyPrescription>[1]) => verifyPrescription(prescriptionId, body),
    onSuccess: (r) => {
      // Sprint 35: the same review releases Dawabag's part of the order for packing
      toast.success(`${order.order_number}: prescription verified (valid until ${r.valid_until})`,
        { description: r.shipments_released ? 'Checked and released for packing.' : undefined });
      onDone();
    },
    onError: (err) => {
      setFieldErrors(getApiFieldErrors(err));
      setError(getApiErrorMessage(err, 'Could not verify'));
    },
    onSettled: refresh,
  });

  const reject = useMutation({
    mutationFn: (reason: string) => rejectPrescription(prescriptionId, reason),
    onSuccess: () => {
      toast.success(`${order.order_number}: prescription rejected`);
      setRejecting(false);
      onDone();
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not reject')),
    onSettled: refresh,
  });

  const submit = () => {
    const out = toVerifyBody(draft);
    if ('error' in out) return setError(out.error);
    setError('');
    setFieldErrors({});
    verify.mutate(out.body);
  };

  const field = (name: keyof RxDraft, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block text-sm">
      <span className="block font-medium text-gray-700 mb-1">{label}</span>
      <input value={draft[name] as string} onChange={(e) => set({ [name]: e.target.value })} className="input" {...props} />
      {fieldErrors[name] && <span className="text-xs text-red-500">{fieldErrors[name]}</span>}
    </label>
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {field('prescriber_name', 'Prescriber (doctor) name', { maxLength: 255 })}
        {field('prescriber_reg_no', 'Prescriber registration no.', { maxLength: 100 })}
        {field('prescribed_on', 'Prescription date', { type: 'date', max: todayIST() })}
        {field('valid_days', 'Valid for (days)', { inputMode: 'numeric' })}
      </div>
      {field('patient_name', 'Patient name', { maxLength: 255 })}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-1">Prescribed products</p>
        <RxLinesTable lines={draft.lines} onChange={(lines) => set({ lines })} />
        {fieldErrors.items && <span className="text-xs text-red-500">{fieldErrors.items}</span>}
      </div>
      <label className="block text-sm">
        <span className="block font-medium text-gray-700 mb-1">Notes (optional)</span>
        <textarea value={draft.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} maxLength={1000} className="input" />
      </label>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={() => setRejecting(true)} className="text-sm text-red-600 hover:underline px-3">
          Reject
        </button>
        <button type="button" onClick={submit} disabled={verify.isPending} className="btn-primary text-sm inline-flex items-center gap-2">
          {verify.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Verify prescription
        </button>
      </div>
      {rejecting && (
        <ReasonDialog
          title="Reject prescription"
          label="Reason (sent to the buyer)"
          confirmLabel="Reject"
          pending={reject.isPending}
          onClose={() => setRejecting(false)}
          onConfirm={(reason) => reject.mutate(reason)}
        />
      )}
    </div>
  );
}
