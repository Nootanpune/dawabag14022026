'use client';
import { X } from 'lucide-react';
import type { PaymentMethod } from '@/lib/payments/api';
import DemoPaymentPanel from './DemoPaymentPanel';

interface Props {
  title: string;
  amountPaise: number;
  methods: PaymentMethod[];
  busy: 'success' | 'failure' | null;
  onPay: (method: PaymentMethod, outcome: 'success' | 'failure') => void;
  onClose: () => void;
}

/** The demo payment as a dialog (e.g. a consultation fee on the trial server). */
export default function DemoPaymentDialog({ title, onClose, ...panel }: Props) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>
        <DemoPaymentPanel {...panel} />
      </div>
    </div>
  );
}
