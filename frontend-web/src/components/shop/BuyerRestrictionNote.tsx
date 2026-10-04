import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { restrictionExplanation, type BuyerRestrictionFields } from '@/lib/shop/buyerRestriction';

/**
 * Sprint 47: "Supplied only to doctors and hospitals" / "… licensed trade buyers" — shown to every
 * viewer of a restricted product (search, product page, substitutes). `detail` adds who may buy it
 * and, for a viewer who may not, that it cannot be added. Renders nothing for an unrestricted product.
 */
export default function BuyerRestrictionNote({ product, detail = false, className }: {
  product: BuyerRestrictionFields; detail?: boolean; className?: string;
}) {
  if (!product.buyer_restriction_label) return null;
  const blocked = product.buyer_may_buy === false;
  const why = detail ? restrictionExplanation(product.buyer_restriction) : null;
  return (
    <div className={cn('rounded-lg border px-2.5 py-1.5 text-xs', blocked ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-sky-200 bg-sky-50 text-sky-900', className)}
      data-testid="buyer-restriction-note">
      <p className="font-semibold flex items-center gap-1">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> {product.buyer_restriction_label}
      </p>
      {why && <p className="mt-0.5">{why}</p>}
      {detail && blocked && <p className="mt-0.5">Your account cannot add it to the cart.</p>}
    </div>
  );
}
