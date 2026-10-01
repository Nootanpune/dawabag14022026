'use client';
import type { PartnerListing } from '@/lib/partner/types';
import { formatPrice } from '@/lib/utils';
import StatusBadge from '@/components/admin/StatusBadge';
import { scheduleBadge } from '@/lib/drugSchedule';
import { formatDateIST } from '@/lib/dates';

export default function ListingsTable({
  listings,
  onEditStock,
}: {
  listings: PartnerListing[];
  onEditStock: (l: PartnerListing) => void;
}) {
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
            <th className="font-medium px-4 py-2.5">Product</th>
            <th className="font-medium px-4 py-2.5">Review</th>
            <th className="font-medium px-4 py-2.5">Listing</th>
            <th className="font-medium px-4 py-2.5 text-right">Stock</th>
            <th className="font-medium px-4 py-2.5">Earliest expiry</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {listings.map((l) => (
            <tr key={l.id} className="border-b border-gray-50 align-top">
              <td className="px-4 py-2.5">
                <p className="font-medium">{l.medicine_name}</p>
                <p className="text-xs text-gray-400">
                  {l.partner_sku ? `SKU ${l.partner_sku} · ` : ''}MRP {formatPrice(l.mrp_paise)}
                  {scheduleBadge(l.drug_schedule) ? ` · ${scheduleBadge(l.drug_schedule)}` : ''}
                  {l.cold_chain && <span className="badge-cold ml-2">Cold chain</span>}
                </p>
                <p className="text-xs text-gray-400">Submitted {formatDateIST(l.submission_date)}</p>
              </td>
              <td className="px-4 py-2.5">
                <StatusBadge status={l.approval_status} />
                {l.approval_status === 'rejected' && (
                  <p className="text-xs text-red-600 mt-1 max-w-[16rem]">
                    {l.rejection_reason_code}
                    {l.rejection_details ? ` — ${l.rejection_details}` : ''}
                  </p>
                )}
              </td>
              <td className="px-4 py-2.5">
                <StatusBadge status={l.listing_status} />
                {l.posted_at && <p className="text-xs text-gray-400 mt-1">Live {formatDateIST(l.posted_at)}</p>}
              </td>
              <td className="px-4 py-2.5 text-right text-xs">
                <p className="font-medium text-sm">{l.qty_available ?? 0}</p>
                <p className="text-gray-400">{l.qty_reserved ?? 0} reserved</p>
              </td>
              <td className="px-4 py-2.5 text-xs">{formatDateIST(l.earliest_expiry)}</td>
              <td className="px-4 py-2.5 text-right">
                {l.approval_status !== 'rejected' && (
                  <button onClick={() => onEditStock(l)} className="btn-outline text-xs py-1.5 px-3 whitespace-nowrap">
                    Edit stock
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
