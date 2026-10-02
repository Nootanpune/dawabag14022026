'use client';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import TradePriceBanner from '@/components/shop/TradePriceBanner';
import { useAuthStore } from '@/store/authStore';
import { useCart, useCartMutations, useSwitchCartLine } from '@/hooks/useCart';
import { cartShape, cartSuggestionKeys, fetchCheaperOptions } from '@/lib/shop/cartSuggestions';
import Header from '@/components/layout/Header';
import CartLineItem from '@/components/cart/CartLineItem';
import CouponBox from '@/components/cart/CouponBox';
import CartSummary from '@/components/cart/CartSummary';
import PrescriptionNotice from '@/components/cart/PrescriptionNotice';
import EmptyCart from '@/components/cart/EmptyCart';
import AddMoreMedicines from '@/components/cart/AddMoreMedicines';
import BuyAgainRow from '@/components/cart/BuyAgainRow';
import CheaperOptionNote from '@/components/cart/CheaperOptionNote';

export default function CartPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { data: cart, isLoading } = useCart();
  const { setQuantity } = useCartMutations();
  const switchLine = useSwitchCartLine();
  const shape = cartShape(cart);
  // Suggestions only; re-asked whenever the lines change (server cart is the only cart)
  const { data: cheaper = [] } = useQuery({
    queryKey: cartSuggestionKeys.cheaper(shape),
    queryFn: fetchCheaperOptions,
    enabled: isAuthenticated && !!cart?.items.length,
    staleTime: 30_000,
  });

  const body = () => {
    if (!isAuthenticated) return <EmptyCart signedIn={false} />;
    if (isLoading || !cart) {
      return (
        <div className="flex justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      );
    }
    if (cart.items.length === 0) {
      return (
        <>
          <EmptyCart signedIn />
          <div className="max-w-2xl mx-auto px-4 pb-8"><BuyAgainRow shape={shape} /></div>
        </>
      );
    }

    const busy = setQuantity.isPending || switchLine.isPending;
    return (
      <div className="max-w-5xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          <h1 className="text-xl font-semibold mb-4">Cart ({cart.item_count} items)</h1>
          <TradePriceBanner />
          {cart.items.map((line) => {
            const option = cheaper.find((o) => o.for_product_id === line.product_id);
            return (
              <CartLineItem
                key={line.product_id}
                line={line}
                disabled={busy}
                busy={setQuantity.isPending && setQuantity.variables?.productId === line.product_id}
                onQuantityChange={(quantity) => setQuantity.mutate({ productId: line.product_id, quantity })}
                suggestion={option && (
                  <CheaperOptionNote
                    option={option}
                    busy={busy}
                    onSwitch={() => switchLine.mutate({ fromId: line.product_id, toId: option.product.id,
                      quantity: Math.max(line.quantity, option.product.min_order_qty || 1), toName: option.product.name })}
                  />
                )}
              />
            );
          })}
          {cart.requires_prescription && <PrescriptionNotice />}
          <AddMoreMedicines />
          <BuyAgainRow shape={shape} />
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
