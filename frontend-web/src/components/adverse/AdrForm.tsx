'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { adrKeys, createAdr, OUTCOMES, SERIOUSNESS, type NewAdr } from '@/lib/compliance/adverseEvents';
import { getApiErrorMessage } from '@/lib/apiErrors';
import type { ProductHit } from '@/lib/recalls/api';
import ProductPicker from '@/components/admin/recalls/ProductPicker';

interface Props {
  productId?: string;
  productName?: string;
  orderId?: string;
}

/** Report a suspected side effect (C-29); a pharmacist reviews every report. */
export default function AdrForm({ productId, productName, orderId }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<ProductHit | null>(null);
  const product = productId ? { id: productId, name: productName ?? 'Selected medicine' } : picked;
  const [f, setF] = useState({ batch: '', initials: '', age: '', gender: '', reaction: '', onset: '', seriousness: '', outcome: '' });
  const [error, setError] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const send = useMutation({
    mutationFn: (body: NewAdr) => createAdr(body),
    onSuccess: (r) => {
      toast.success(`Report ${r.report_no} sent to our pharmacist`);
      queryClient.invalidateQueries({ queryKey: adrKeys.all });
      router.push(`/account/side-effects/${r.id}`);
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not send the report')),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) return setError('Choose the medicine');
    if (!f.initials.trim()) return setError("Enter the patient's initials");
    if (f.reaction.trim().length < 10) return setError('Describe the reaction (at least 10 characters)');
    if (!f.seriousness) return setError('Choose how serious it was');
    const age = f.age.trim() ? Number(f.age) : undefined;
    if (age !== undefined && (!Number.isInteger(age) || age < 0 || age > 120)) return setError('Enter a valid age');
    setError('');
    send.mutate({
      product_id: product.id,
      ...(orderId ? { order_id: orderId } : {}),
      ...(f.batch.trim() ? { batch_number: f.batch.trim() } : {}),
      patient_initials: f.initials.trim(),
      ...(age !== undefined ? { patient_age_years: age } : {}),
      ...(f.gender ? { patient_gender: f.gender as NewAdr['patient_gender'] } : {}),
      reaction: f.reaction.trim(),
      ...(f.onset ? { onset_date: f.onset } : {}),
      seriousness: f.seriousness as NewAdr['seriousness'],
      ...(f.outcome ? { outcome: f.outcome as NewAdr['outcome'] } : {}),
    });
  };

  return (
    <form onSubmit={submit} className="card space-y-3 text-sm">
      <div>
        <span className="block font-medium text-gray-700 mb-1">Medicine</span>
        {productId ? <p>{product?.name}</p> : <ProductPicker value={picked} onChange={setPicked} />}
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Patient initials</span>
          <input value={f.initials} onChange={set('initials')} maxLength={10} className="input" />
        </label>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Age (optional)</span>
          <input value={f.age} onChange={set('age')} inputMode="numeric" maxLength={3} className="input" />
        </label>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Gender (optional)</span>
          <select value={f.gender} onChange={set('gender')} className="input">
            <option value="">—</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </select>
        </label>
      </div>
      <label className="block">
        <span className="block font-medium text-gray-700 mb-1">What happened?</span>
        <textarea value={f.reaction} onChange={set('reaction')} rows={4} maxLength={5000} className="input" />
      </label>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">How serious?</span>
          <select value={f.seriousness} onChange={set('seriousness')} className="input">
            <option value="">Select…</option>
            {SERIOUSNESS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Outcome so far (optional)</span>
          <select value={f.outcome} onChange={set('outcome')} className="input">
            <option value="">—</option>
            {OUTCOMES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Started on (optional)</span>
          <input type="date" value={f.onset} onChange={set('onset')} className="input" />
        </label>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Batch number (optional)</span>
          <input value={f.batch} onChange={set('batch')} maxLength={100} className="input font-mono" />
        </label>
      </div>
      <p className="text-xs text-gray-500">
        In an emergency, see a doctor or call 108 first. This report goes to our pharmacist, who may forward it to the
        Pharmacovigilance Programme of India.
      </p>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button type="submit" disabled={send.isPending} className="btn-primary inline-flex items-center gap-2">
        {send.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Send report
      </button>
    </form>
  );
}
