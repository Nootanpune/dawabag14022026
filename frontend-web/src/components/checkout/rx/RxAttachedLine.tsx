import { CheckCircle2 } from 'lucide-react';
import { formatDateTimeIST } from '@/lib/dates';

export interface ChosenRx { id: string; created_at: string; /** photo, PDF, from Dr X, e-prescription */ kind: string }

/** "Prescription (photo) uploaded 02 Oct 2026, 9:56 am ✓ — our pharmacist checks it before dispatch" (C-08). */
export default function RxAttachedLine({ rx, onChange }: { rx: ChosenRx; onChange?: () => void }) {
  return (
    <div className="p-3 rounded-lg border border-green-200 bg-green-50 text-sm text-green-900 flex items-start gap-2" data-testid="rx-attached">
      <CheckCircle2 className="w-5 h-5 shrink-0 text-green-700" aria-hidden="true" />
      <p className="flex-1">
        <strong>Prescription ({rx.kind}) uploaded {formatDateTimeIST(rx.created_at)} ✓</strong> — our pharmacist checks it before dispatch.
      </p>
      {onChange && <button type="button" onClick={onChange} className="text-brand-700 font-medium hover:underline shrink-0">Change</button>}
    </div>
  );
}
