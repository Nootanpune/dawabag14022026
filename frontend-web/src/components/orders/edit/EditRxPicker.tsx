'use client';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { fetchMyPrescriptions, prescriptionKeys, usableAtCheckout } from '@/lib/prescriptions/api';
import PrescriptionUploadCard from '@/components/prescriptions/PrescriptionUploadCard';
import RxChoiceCard from '@/components/checkout/rx/RxChoiceCard';

interface Props {
  orderId: string;
  /** the prescription medicines being added or raised */
  names: string[];
  value: string | null;
  onChange: (id: string) => void;
}

/**
 * A valid prescription for prescription medicines added to the order (Sprint 44, owner decision
 * 2026-10-03; C-08): the one already sent with this order (if not yet checked), a saved verified
 * one, or a new upload. The order goes back to our pharmacist's prescription check.
 */
export default function EditRxPicker({ orderId, names, value, onChange }: Props) {
  const { data } = useQuery({ queryKey: prescriptionKeys.mine, queryFn: fetchMyPrescriptions });
  const [newId, setNewId] = useState<string | null>(null);
  const list = useMemo(() => [...(data ?? []).filter((r) => r.order_id === orderId && r.status === 'pending'), ...usableAtCheckout(data ?? [])],
    [data, orderId]);
  useEffect(() => { if (newId && list.some((r) => r.id === newId) && value !== newId) onChange(newId); }, [newId, list, value, onChange]);
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2" aria-labelledby="edit-rx">
      <h3 id="edit-rx" className="text-sm font-semibold flex items-center gap-2">
        <FileText className="w-4 h-4 text-brand-700" aria-hidden="true" /> Prescription needed for {names.join(', ')}
      </h3>
      <p className="text-xs text-gray-700">Choose a valid prescription that covers it, or upload one. Our pharmacist checks it before the order is approved.</p>
      <div role="radiogroup" aria-labelledby="edit-rx" className="space-y-2">
        {list.map((rx) => <RxChoiceCard key={rx.id} rx={rx} selected={rx.id === value} onSelect={() => onChange(rx.id)} />)}
      </div>
      <PrescriptionUploadCard compact title={list.length ? 'Or upload a new one' : 'Upload your prescription'} onUploaded={setNewId} />
    </section>
  );
}
