'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { fetchSellingRights, sellingRightsKeys } from '@/lib/admin/sellingRights';

/** Dashboard: why some stock is not offered to some buyers — a missing or lapsed drug
 *  licence in Dawabag's register, or a partner that may sell to nobody (Sprint 32). */
export default function SellingRightsWarnings() {
  const { data } = useQuery({ queryKey: sellingRightsKeys.status, queryFn: fetchSellingRights, refetchInterval: 300_000 });
  if (!data?.warnings.length) return null;
  return (
    <div className="card mb-6 border-amber-200 bg-amber-50" role="status" data-testid="selling-rights-warnings">
      <h2 className="font-semibold text-sm text-amber-900 flex items-center gap-2 mb-2">
        <ShieldAlert className="w-4 h-4 text-amber-600" aria-hidden="true" /> Drug licences limit who can be supplied
      </h2>
      <ul className="space-y-1.5 text-sm text-amber-900">
        {data.warnings.map((w) => (
          <li key={`${w.code}-${w.link}`}>
            {w.message}{' '}
            <Link href={w.link} className="font-medium underline underline-offset-2">
              {w.code === 'partner_no_rights' ? 'Open the partner' : 'Open the licence register'}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
