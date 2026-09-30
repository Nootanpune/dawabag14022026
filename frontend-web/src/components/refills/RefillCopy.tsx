import { Info } from 'lucide-react';
import { REFILL_UX_COPY } from '@/lib/refills';

export default function RefillCopy() {
  return (
    <p className="flex gap-2 text-xs text-gray-600 bg-brand-50 rounded-lg p-3">
      <Info className="w-4 h-4 text-brand-600 flex-shrink-0 mt-0.5" />
      <span>{REFILL_UX_COPY}</span>
    </p>
  );
}
