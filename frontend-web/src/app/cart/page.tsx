'use client';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useCart, useCartMutations } from '@/hooks/useCart';
import Header from '@/components/layout/Header';
import CartLineItem from '@/components/cart/CartLineItem';
import CouponBox from '@/components/cart/CouponBox';
import CartSummary from '@/components/cart/CartSummary';
import PrescriptionNotice from '@/components/cart/PrescriptionNotice';
import EmptyCart from '@/components/cart/EmptyCart';

export default function CartPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { data: cart, isLoading } = useCart();
  const { setQuantity } = useCartMutations();

  const body = () => {
    if (!isAuthenticated) return <EmptyCart signedIn={false} />;
    if (isLoading || !cart) {
      return (
        <div className="flex justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      );
    }
    if (cart.items.length === 0) return <EmptyCart signedIn />;

    return (
      <div className="max-w-5xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          <h1 className="text-xl font-semibold mb-4">Cart ({cart.item_count} items)</h1>
          {cart.items.map((line) => (
            <CartLineItem
              key={line.product_id}
              line={line}
              disabled={setQuantity.isPending}
              onQuantityChange={(quantity) => setQuantity.mutate({ productId: line.product_id, quantity })}
            />
          ))}
          {cart.requires_prescription && <PrescriptionNotice />}
        </div>

        <div className="space-y-4">
          <CouponBox coupon={cart.coupon} />
          <CartSummary cart={cart} onCheckout={() => router.push('/checkout')} />
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      {body()}
    </div>
  );
}
