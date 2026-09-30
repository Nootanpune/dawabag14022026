'use client';
import { useState } from 'react';
import { Tag, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatPrice } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { useCartMutations } from '@/hooks/useCart';
import type { CartCoupon } from '@/lib/cart';

/** Applies / removes the coupon on the server cart (PUT /cart/coupon). */
export default function CouponBox({ coupon }: { coupon: CartCoupon | null }) {
  const { setCoupon } = useCartMutations();
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const apply = () => {
    const code = input.trim().toUpperCase();
    if (!code) return;
    setError('');
    setCoupon.mutate(code, {
      onSuccess: (cart) => {
        setInput('');
        if (cart.coupon?.valid) toast.success(`Coupon applied! You save ${formatPrice(cart.coupon.discount_paise)}`);
      },
      onError: (err) => setError(getApiErrorMessage(err, 'Invalid coupon')),
    });
  };

  const remove = () =>
    setCoupon.mutate(null, { onError: (err) => toast.error(getApiErrorMessage(err, 'Could not remove coupon')) });

  return (
    <div className="card">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Tag className="w-4 h-4 text-brand-600" /> Coupon / Referral code
      </h3>
      {coupon ? (
        <div
          className={`flex items-center justify-between rounded-lg px-3 py-2 border ${
            coupon.valid ? 'bg-brand-50 border-brand-200' : 'bg-amber-50 border-amber-200'
          }`}
        >
          <div>
            <p className={`text-sm font-medium ${coupon.valid ? 'text-brand-700' : 'text-amber-800'}`}>{coupon.code}</p>
            {coupon.valid ? (
              <p className="text-xs text-brand-600">Save {formatPrice(coupon.discount_paise)}</p>
            ) : (
              <p className="text-xs text-amber-700">{coupon.message || 'This coupon no longer applies'}</p>
            )}
          </div>
          <button onClick={remove} disabled={setCoupon.isPending} className="text-xs text-red-500 hover:underline">
            Remove
          </button>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              placeholder="Enter code"
              className="input flex-1 text-sm py-2"
              onKeyDown={(e) => e.key === 'Enter' && apply()}
            />
            <button onClick={apply} disabled={setCoupon.isPending} className="btn-outline text-sm py-2 px-3">
              {setCoupon.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply'}
            </button>
          </div>
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </>
      )}
    </div>
  );
}
