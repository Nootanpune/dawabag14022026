import { KeyRound } from 'lucide-react';

/** The buyer's handover code for a sealed prescription pack on its way (C-26). */
export default function DeliveryCodeBanner({ code }: { code: string }) {
  return (
    <div className="rounded-lg border-2 border-brand-300 bg-brand-50 p-3 mt-2">
      <p className="text-xs font-semibold text-brand-800 flex items-center gap-1">
        <KeyRound className="w-3.5 h-3.5" /> Delivery code
      </p>
      <p className="text-3xl font-mono font-bold tracking-[0.3em] text-brand-700 my-1">{code}</p>
      <p className="text-xs text-brand-800">Give this code only when you receive the sealed pack.</p>
    </div>
  );
}
