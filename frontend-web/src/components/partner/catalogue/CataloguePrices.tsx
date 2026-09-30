import type { CatalogueProduct } from '@/lib/partner/types';
import { formatPrice } from '@/lib/utils';

const PRICES: { key: keyof CatalogueProduct; label: string }[] = [
  { key: 'mrp_paise', label: 'MRP' },
  { key: 'offer_price_paise', label: 'Dawabag selling price' },
  { key: 'ptr_price_paise', label: 'PTR (retailer)' },
  { key: 'pts_price_paise', label: 'PTS (stockist)' },
  { key: 'institutional_price_paise', label: 'Institutional' },
];

/** Catalogue prices the partner agrees to sell at (set by Dawabag, never by the partner). */
export default function CataloguePrices({ product }: { product: CatalogueProduct }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm bg-gray-50 rounded-lg p-3">
      {PRICES.map(({ key, label }) => {
        const v = product[key] as number | null;
        return (
          <div key={key} className="flex justify-between gap-2">
            <dt className="text-gray-500">{label}</dt>
            <dd className="font-medium">{v != null ? formatPrice(v) : '—'}</dd>
          </div>
        );
      })}
    </dl>
  );
}
