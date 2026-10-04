'use client';
import type { CatalogueProduct } from '@/lib/partner/types';
import { formatPrice } from '@/lib/utils';
import { scheduleBadge } from '@/lib/drugSchedule';
import { RESTRICTION_STAFF_LABELS, type BuyerRestriction } from '@/lib/shop/buyerRestriction';

export default function CatalogueResults({
  products,
  onList,
}: {
  products: CatalogueProduct[];
  onList: (p: CatalogueProduct) => void;
}) {
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
            <th className="font-medium px-4 py-2.5">Product</th>
            <th className="font-medium px-4 py-2.5">Schedule</th>
            <th className="font-medium px-4 py-2.5 text-right">MRP</th>
            <th className="font-medium px-4 py-2.5 text-right">Selling price</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} className="border-b border-gray-50">
              <td className="px-4 py-2.5">
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-gray-400">
                  {p.generic_name ?? ''} · {p.sku}
                  {p.cold_chain && <span className="badge-cold ml-2">Cold chain</span>}
                  {/* Sprint 47: who Dawabag sells it to — listing is still allowed */}
                  {p.buyer_restriction && p.buyer_restriction !== 'everyone' && (
                    <span className="ml-2 text-xs font-medium rounded-full px-2 py-0.5 bg-amber-100 text-amber-900">
                      {RESTRICTION_STAFF_LABELS[p.buyer_restriction as BuyerRestriction] ?? p.buyer_restriction}
                    </span>
                  )}
                </p>
              </td>
              <td className="px-4 py-2.5 text-xs">{scheduleBadge(p.drug_schedule) ?? '—'}</td>
              <td className="px-4 py-2.5 text-right">{formatPrice(p.mrp_paise)}</td>
              <td className="px-4 py-2.5 text-right">
                {p.offer_price_paise != null ? formatPrice(p.offer_price_paise) : '—'}
              </td>
              <td className="px-4 py-2.5 text-right">
                {p.already_listed ? (
                  <span className="text-xs text-gray-400">Already listed</span>
                ) : (
                  <button onClick={() => onList(p)} className="btn-primary text-xs py-1.5 px-3 whitespace-nowrap">
                    List this product
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
