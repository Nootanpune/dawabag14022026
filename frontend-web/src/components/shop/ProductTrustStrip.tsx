import Link from 'next/link';
import { PackageCheck, CalendarX, UserCheck } from 'lucide-react';
import { infoPageHref } from '@/lib/infoPages/api';

const ITEM = 'flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 hover:border-brand-400';

/** Links to the trust pages (Sprint 33); each page says only what the system actually does. */
export default function ProductTrustStrip() {
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2" aria-label="How we look after your medicines" data-testid="product-trust-strip">
      <li>
        <Link href={infoPageHref('genuine-medicines')} className={ITEM}>
          <PackageCheck className="w-4 h-4 text-brand-600 shrink-0" aria-hidden="true" /> Genuine medicines
        </Link>
      </li>
      <li>
        <Link href={infoPageHref('expired-damaged-recalled')} className={ITEM}>
          <CalendarX className="w-4 h-4 text-brand-600 shrink-0" aria-hidden="true" /> Expired, damaged or recalled
        </Link>
      </li>
      <li>
        <Link href={infoPageHref('pharmacist-checked')} className={ITEM}>
          <UserCheck className="w-4 h-4 text-brand-600 shrink-0" aria-hidden="true" /> Checked by a pharmacist
        </Link>
      </li>
    </ul>
  );
}
