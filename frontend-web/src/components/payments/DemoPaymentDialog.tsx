'use client';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import DemoPaymentPanel from './DemoPaymentPanel';

type PanelProps = Parameters<typeof DemoPaymentPanel>[0];

/** The demo payment as a dialog (e.g. a consultation fee on the trial server). Escape steps back, then closes. */
export default function DemoPaymentDialog({ title, onClose, ...panel }: PanelProps & { title: string; onClose: () => void }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titleRef.current?.focus(); }, []);
  const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} onKeyDown={onKeyDown}
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 ref={titleRef} tabIndex={-1} className="text-lg font-semibold outline-none">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>
        <DemoPaymentPanel {...panel} />
      </div>
    </div>
  );
}
