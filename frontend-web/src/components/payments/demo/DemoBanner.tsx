import { FlaskConical } from 'lucide-react';

/** Shown on every step of the trial's demo checkout: nothing here is a real payment. */
export default function DemoBanner() {
  return (
    <div className="p-3 rounded-lg border-2 border-dashed border-amber-400 bg-amber-50 text-sm text-amber-900 flex gap-2">
      <FlaskConical className="w-5 h-5 shrink-0" aria-hidden="true" />
      <p><strong>Demo payment — no money moves.</strong> This is the trial site, so real payment is switched off.
        The steps look like a real payment, but nothing is sent to a bank, card or wallet.</p>
    </div>
  );
}
