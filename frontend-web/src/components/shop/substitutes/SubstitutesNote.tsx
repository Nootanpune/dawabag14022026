import Link from 'next/link';
import { Info } from 'lucide-react';

/** Shown with every substitutes list: same medicine, different maker; ask before switching (C-08). */
export default function SubstitutesNote({ note, consultHref }: { note: string; consultHref: string }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-gray-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2" data-testid="substitutes-note">
      <Info className="w-4 h-4 text-blue-700 shrink-0" aria-hidden="true" />
      <span>
        {note}{' '}
        <Link href={consultHref} className="font-medium text-brand-700 underline underline-offset-2">Consult a doctor</Link>
      </span>
    </p>
  );
}
