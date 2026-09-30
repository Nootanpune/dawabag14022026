'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Plus, Minus, Tag, ShoppingBag, ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCartStore } from '@/store/cartStore';
import { useAuthStore } from '@/store/authStore';
import { formatPrice } from '@/lib/utils';
import api from '@/lib/api';
import Header from '@/components/layout/Header';

const SHIPPING_PAISE = 4900;

export default function CartPage() {
  const router = useRouter();
  const { items, removeItem, updateQty, subtotal, coupon_code, coupon_discount_paise,
          setCoupon, removeCoupon, requiresPrescription } = useCartStore();
  const { isAuthenticated } = useAuthStore();
  const [couponInput, setCouponInput] = useState('');
  const [validatingCoupon, setValidatingCoupon] = useState(false);

  const sub = subtotal();
  const discount = coupon_discount_paise;
  const shipping = sub > 0 ? SHIPPING_PAISE : 0;
  const total = sub + shipping - discount;

  const handleApplyCoupon = async () => {
    if (!couponInput.trim()) return;
    setValidatingCoupon(true);
    try {
      const { data } = await api.post('/coupons/validate', {
        code: couponInput.toUpperCase(),
        order_amount_paise: sub,
      });
      setCoupon(data.data.code, data.data.discount_paise);
      toast.success(`Coupon applied! You save ${formatPrice(data.data.discount_paise)}`);
      setCouponInput('');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Invalid coupon');
    } finally {
      setValidatingCoupon(false);
    }
  };

  const handleCheckout = () => {
    if (!isAuthenticated) {
      toast.info('Please login to continue');
      router.push('/auth/login');
      return;
    }
    router.push('/checkout');
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
          <ShoppingBag className="w-16 h-16 text-gray-300 mb-4" />
          <h2 className="text-xl font-semibold text-gray-600 mb-2">Your cart is empty</h2>
          <p className="text-sm text-gray-400 mb-6">Browse medicines and add them to your cart</p>
          <button onClick={() => router.push('/')} className="btn-primary">
            Browse medicines
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-5xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Cart items */}
        <div className="lg:col-span-2 space-y-3">
          <h1 className="text-xl font-semibold mb-4">Cart ({items.length} items)</h1>

          {items.map((item) => (
            <div key={item.product_id} className="card flex gap-4">
              <div className="w-16 h-16 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
                <span className="text-2xl">💊</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-sm line-clamp-2">{item.name}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{item.sku}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                    ${['Schedule H','Schedule H1'].includes(item.drug_schedule)
                      ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                    {item.drug_schedule}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-2">
                  {/* Qty controls */}
                  <div className="flex items-center gap-2 border border-gray-200 rounded-lg overflow-hidden">
                    <button
                      onClick={() => updateQty(item.product_id, item.quantity - 1)}
                      className="p-1.5 hover:bg-gray-100 text-gray-600"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-sm font-medium w-6 text-center">{item.quantity}</span>
                    <button
                      onClick={() => updateQty(item.product_id, item.quantity + 1)}
                      disabled={item.quantity >= item.max_qty}
                      className="p-1.5 hover:bg-gray-100 text-gray-600 disabled:opacity-30"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <span className="font-semibold text-brand-600">
                    {formatPrice(item.unit_price_paise * item.quantity)}
                  </span>
                </div>
              </div>
              <button
                onClick={() => removeItem(item.product_id)}
                className="p-2 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 self-start"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}

          {/* Prescription notice */}
          {requiresPrescription() && (
            <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm">
              <span className="text-lg mt-0.5">📋</span>
              <div>
                <p className="font-medium text-amber-800">Prescription required</p>
                <p className="text-amber-700 text-xs mt-0.5">
                  One or more items require a valid prescription. You'll upload it during checkout.
                  Our pharmacist will call to verify before dispatch.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="space-y-4">
          {/* Coupon */}
          <div className="card">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Tag className="w-4 h-4 text-brand-600" /> Coupon / Referral code
            </h3>
            {coupon_code ? (
              <div className="flex items-center justify-between bg-brand-50 border border-brand-200 rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-brand-700">{coupon_code}</p>
                  <p className="text-xs text-brand-600">Save {formatPrice(coupon_discount_paise)}</p>
                </div>
                <button onClick={removeCoupon} className="text-xs text-red-500 hover:underline">Remove</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  placeholder="Enter code"
                  className="input flex-1 text-sm py-2"
                  onKeyDown={(e) => e.key === 'Enter' && handleApplyCoupon()}
                />
                <button
                  onClick={handleApplyCoupon}
                  disabled={validatingCoupon}
                  className="btn-outline text-sm py-2 px-3"
                >
                  {validatingCoupon ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply'}
                </button>
              </div>
            )}
          </div>

          {/* Price breakdown */}
          <div className="card">
            <h3 className="text-sm font-semibold mb-4">Order summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal ({items.length} items)</span>
                <span>{formatPrice(sub)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Shipping</span>
                <span>{formatPrice(shipping)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount ({coupon_code})</span>
                  <span>–{formatPrice(discount)}</span>
                </div>
              )}
              <div className="border-t border-gray-100 pt-2 mt-2 flex justify-between font-semibold text-base">
                <span>Total payable</span>
                <span className="text-brand-600">{formatPrice(total)}</span>
              </div>
              <p className="text-xs text-gray-400">Incl. all taxes (GST)</p>
            </div>

            <button
              onClick={handleCheckout}
              className="btn-primary w-full mt-4 py-3 flex items-center justify-center gap-2 text-base"
            >
              Proceed to checkout <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
