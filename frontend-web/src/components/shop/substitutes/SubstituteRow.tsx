import Link from 'next/link';
import { formatPrice } from '@/lib/utils';
import { perUnitText, type Substitute } from '@/lib/shop/productPageExtras';
import CartQuantityControl from '@/components/cart/CartQuantityControl';
import ProductImage from '@/components/shop/ProductImage';
import BuyerRestrictionNote from '@/components/shop/BuyerRestrictionNote';

/** One substitute: maker, pack, price per unit, "Save X%", stock and Add. Never swapped automatically. */
export default function SubstituteRow({ s }: { s: Substitute }) {
  return (
    <li className="flex gap-3 py-3" data-testid="substitute-row">
      <div className="w-16 shrink-0"><ProductImage name={s.name} imageUrl={s.image_url} size="sm" /></div>
      <div className="flex-1 min-w-0">
        <Link href={`/shop/${s.id}`} className="font-medium text-gray-900 hover:text-brand-700 break-words">{s.name}</Link>
        <p className="text-xs text-gray-500">{[s.maker, s.net_quantity].filter(Boolean).join(' · ')}</p>
        <p className="text-sm mt-0.5">
          <span className="font-semibold">{formatPrice(s.display_price_paise)}</span>
          <span className="text-xs text-gray-500"> · {perUnitText(s.per_unit_paise, s.unit_label)}</span>
          {s.save_pct != null && (
            <span className="ml-2 text-xs font-semibold text-green-800 bg-green-50 rounded px-1.5 py-0.5">Save {s.save_pct}%</span>
          )}
        </p>
        {!s.in_stock && <p className="text-xs font-medium text-red-700">Out of stock</p>}
        <BuyerRestrictionNote product={s} className="mt-1" />
      </div>
      <div className="w-28 shrink-0 self-center">
        <CartQuantityControl product={{ ...s, drug_schedule: s.drug_schedule ?? 'OTC' }} />
      </div>
    </li>
  );
}
