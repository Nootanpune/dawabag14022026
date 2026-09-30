'use client';
import Link from 'next/link';
import type { Settlement } from '@/lib/marketplace/settlement';
import { formatDateIST } from '@/lib/admin/format';
import { formatPrice } from '@/lib/utils';
import StatusBadge from '@/components/admin/StatusBadge';

interface Props {
  settlements: Settlement[];
  /** detail route prefix, e.g. '/partner/settlements' */
  basePath: string;
  showPartner?: boolean;
}

export default function SettlementsTable({ settlements, basePath, showPartner }: Props) {
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
            <th className="font-medium px-4 py-2.5">Batch</th>
            {showPartner && <th className="font-medium px-4 py-2.5">Partner</th>}
            <th className="font-medium px-4 py-2.5">Period</th>
            <th className="font-medium px-4 py-2.5 text-right">Orders</th>
            <th className="font-medium px-4 py-2.5 text-right">Gross</th>
            <th className="font-medium px-4 py-2.5 text-right">Net payable</th>
            <th className="font-medium px-4 py-2.5">Status</th>
          </tr>
        </thead>
        <tbody>
          {settlements.map((s) => (
            <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="px-4 py-2.5">
                <Link href={`${basePath}/${s.id}`} className="font-medium text-brand-700 hover:underline">
                  {s.batch_ref}
                </Link>
              </td>
              {showPartner && <td className="px-4 py-2.5">{s.partner_name}</td>}
              <td className="px-4 py-2.5 text-xs">
                {formatDateIST(s.period_from)} – {formatDateIST(s.period_to)}
              </td>
              <td className="px-4 py-2.5 text-right">{s.total_orders}</td>
              <td className="px-4 py-2.5 text-right">{formatPrice(s.gross_sale_value_paise)}</td>
              <td className="px-4 py-2.5 text-right font-semibold">{formatPrice(s.net_payable_paise)}</td>
              <td className="px-4 py-2.5">
                <StatusBadge status={s.payment_status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
