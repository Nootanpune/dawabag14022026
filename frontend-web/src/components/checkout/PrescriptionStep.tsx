'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, FileText, Loader2 } from 'lucide-react';
import { fetchMyPrescriptions, prescriptionKeys, usableAtCheckout, type MyPrescription } from '@/lib/prescriptions/api';
import PrescriptionUploadCard from '@/components/prescriptions/PrescriptionUploadCard';
import RxChoiceCard from './rx/RxChoiceCard';
import RxPolicyNote from './rx/RxPolicyNote';

interface Props {
  /** the medicines in this order that need a prescription (Schedule H / H1, C-08) */
  rxItems: { name: string; quantity: number }[];
  selectedId: string | null;
  onSelect: (rx: MyPrescription) => void;
  onBack: () => void;
  onContinue: () => void;
  continueLabel?: string;
  busy?: boolean;
  /** e.g. the server said the chosen prescription cannot be used */
  error?: string;
}

const SHOW = 4;

/**
 * Which prescription goes with this order: one uploaded earlier (photo, date, status)
 * or a new upload. Chosen before the order is placed, so review and payment can say
 * which one is attached. A pharmacist checks it with the order before dispatch (C-08).
 */
export default function PrescriptionStep({ rxItems, selectedId, onSelect, onBack, onContinue, continueLabel = 'Continue to review', busy, error }: Props) {
  const { data, isLoading } = useQuery({ queryKey: prescriptionKeys.mine, queryFn: fetchMyPrescriptions });
  const usable = usableAtCheckout(data ?? []);
  const [all, setAll] = useState(false);
  const [newId, setNewId] = useState<string | null>(null);

  // A just-uploaded prescription is chosen for the buyer
  useEffect(() => {
    const fresh = newId && usable.find((r) => r.id === newId);
    if (fresh && selectedId !== newId) onSelect(fresh);
  }, [newId, usable, selectedId, onSelect]);

  const selected = usable.find((r) => r.id === selectedId);
  const listed = all ? usable : usable.slice(0, SHOW);
  if (selected && !listed.includes(selected)) listed.push(selected);

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="w-5 h-5 text-brand-600" aria-hidden="true" /> Prescription needed
        </h2>
        <p className="text-sm text-gray-700 mt-1">These medicines need a doctor’s prescription. Add it now, before payment:</p>
        <ul className="mt-1 text-sm font-medium text-gray-900 list-disc pl-5">
          {rxItems.map((i) => <li key={i.name}>{i.name} × {i.quantity}</li>)}
        </ul>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Loading your prescriptions…</p>
      ) : usable.length > 0 && (
        <section aria-labelledby="rx-choose" className="space-y-2">
          <h3 id="rx-choose" className="text-sm font-semibold text-gray-800">Choose one of your prescriptions</h3>
          <div role="radiogroup" aria-labelledby="rx-choose" className="space-y-2">
            {listed.map((rx) => <RxChoiceCard key={rx.id} rx={rx} selected={rx.id === selectedId} onSelect={() => onSelect(rx)} />)}
          </div>
          {usable.length > SHOW && !all && (
            <button type="button" onClick={() => setAll(true)} className="text-sm font-medium text-brand-700 hover:underline">
              Show all {usable.length} prescriptions
            </button>
          )}
        </section>
      )}

      <PrescriptionUploadCard compact title={usable.length ? 'Or upload a new one' : 'Upload your prescription'} onUploaded={setNewId} />
      <p className="text-xs text-gray-600">It must show the doctor’s name and registration number, the date, the patient’s name and these medicines.</p>

      <RxPolicyNote />

      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}

      <div className="flex gap-3">
        <button type="button" onClick={onBack} disabled={busy} className="btn-outline flex items-center gap-1">
          <ChevronLeft className="w-4 h-4" aria-hidden="true" /> Back
        </button>
        <button type="button" onClick={onContinue} disabled={busy || !selected}
          className="btn-primary flex-1 py-3 flex items-center justify-center gap-2">
          {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
          {selected ? continueLabel : 'Choose or upload a prescription'} {selected && <ChevronRight className="w-4 h-4" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
