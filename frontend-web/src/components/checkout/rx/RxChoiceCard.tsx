'use client';
import { CheckCircle2, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MyPrescription } from '@/lib/prescriptions/api';
import { prescriptionStatus } from '@/lib/prescriptions/status';
import { prescriptionTitle, prescriptionUploaded } from '@/lib/prescriptions/describe';
import RxThumb from './RxThumb';

/** One of the buyer's prescriptions as a choice at checkout (radio). */
export default function RxChoiceCard({ rx, selected, onSelect }: { rx: MyPrescription; selected: boolean; onSelect: () => void }) {
  const status = prescriptionStatus(rx);
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onSelect}
      aria-label={`${prescriptionTitle(rx)}, ${prescriptionUploaded(rx)}, ${status.label}`}
      className={cn('w-full text-left p-3 rounded-xl border-2 flex items-center gap-3 transition-colors',
        selected ? 'border-brand-600 bg-brand-50' : 'border-gray-200 bg-white hover:border-brand-300')}>
      <RxThumb rx={rx} />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-gray-900">{prescriptionTitle(rx)}</span>
        <span className="block text-xs text-gray-600">{prescriptionUploaded(rx)}</span>
        <span className={cn('block text-xs font-medium mt-0.5', status.tone === 'ok' ? 'text-green-700' : 'text-amber-800')}>{status.label}</span>
      </span>
      {selected
        ? <span className="shrink-0 flex flex-col items-center text-brand-700 text-xs font-semibold"><CheckCircle2 className="w-6 h-6" aria-hidden="true" />Chosen</span>
        : <Circle className="w-6 h-6 shrink-0 text-gray-300" aria-hidden="true" />}
    </button>
  );
}
