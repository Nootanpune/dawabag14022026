import Link from 'next/link';
import { ShieldCheck, UserCheck, PackageCheck } from 'lucide-react';

const ITEM = 'flex items-center gap-2 rounded-xl bg-white border border-gray-200 px-3 py-2.5 text-sm text-gray-700';

/** Three trust signals; the licence badge opens the licence details (C-04). */
export default function TrustStrip() {
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-5" aria-label="Why buy from Dawabag">
      <li>
        <Link href="/legal" className={`${ITEM} hover:border-brand-400`}>
          <ShieldCheck className="w-5 h-5 text-brand-600 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-medium text-gray-900">Licensed pharmacy</span>
            <span className="block text-xs text-gray-500">See our drug licences</span>
          </span>
        </Link>
      </li>
      <li className={ITEM}>
        <UserCheck className="w-5 h-5 text-brand-600 shrink-0" aria-hidden="true" />
        <span>
          <span className="font-medium text-gray-900">Pharmacist-checked</span>
          <span className="block text-xs text-gray-500">Every prescription order</span>
        </span>
      </li>
      <li className={ITEM}>
        <PackageCheck className="w-5 h-5 text-brand-600 shrink-0" aria-hidden="true" />
        <span>
          <span className="font-medium text-gray-900">Genuine stock</span>
          <span className="block text-xs text-gray-500">From licensed suppliers</span>
        </span>
      </li>
    </ul>
  );
}
