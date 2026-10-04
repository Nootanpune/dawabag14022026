'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/authStore';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { CART_QUERY_KEY, fetchCart, putCartItem, type CartView } from '@/lib/cart';
import { cannotOrderOnline } from '@/lib/search/api';
import { quantityLimits, type QtyLimits } from '@/lib/shop/quantity';
import { useCart } from './useCart';
import type { BuyerRestrictionFields } from '@/lib/shop/buyerRestriction';

/** Sprint 47: with who may buy it (buyer_may_buy false → no Add) */
export interface QtyProduct extends BuyerRestrictionFields {
  id: string;
  name: string;
  drug_schedule: string;
  in_stock: boolean;
  /** the buyer's own limits from the server (search: min/max_order_qty; product page) */
  min_order_qty?: number | null;
  max_order_qty?: number | null;
  max_qty_per_order?: number | null;
}

/**
 * This product's quantity in the server cart (the only cart) and how to change it.
 * The first Add puts in the buyer's minimum; − at the minimum removes the line.
 */
export function useCartQuantity(product: QtyProduct) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { data: cart } = useCart();
  const line = cart?.items.find((i) => i.product_id === product.id);
  const limits: QtyLimits = quantityLimits(product, line);

  const mutation = useMutation({
    mutationFn: async (quantity: number) => {
      // Fresh cart if the page has none yet, so an Add never overwrites a line
      if (!queryClient.getQueryData<CartView>(CART_QUERY_KEY)) await queryClient.fetchQuery({ queryKey: CART_QUERY_KEY, queryFn: fetchCart });
      return putCartItem(product.id, quantity);
    },
    onSuccess: (next, quantity) => {
      queryClient.setQueryData(CART_QUERY_KEY, next);
      if (!line && quantity > 0) {
        toast.success(`${product.name} added to your cart`, { action: { label: 'View cart', onClick: () => router.push('/cart') } });
      }
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'We could not update your cart. Please try again.'));
      queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY });
    },
  });

  const setQuantity = (quantity: number) => {
    if (!isAuthenticated) {
      toast.info('Please sign in to add medicines to your cart');
      router.push('/auth/login');
      return;
    }
    if (quantity > 0 && cannotOrderOnline(product.drug_schedule)) {
      toast.error('This medicine cannot be ordered online.');
      return;
    }
    if (quantity > 0 && !product.in_stock && !line) {
      toast.error('This medicine is out of stock right now.');
      return;
    }
    if (quantity > limits.max) {
      toast.info(limits.maxMessage);
      return;
    }
    mutation.mutate(quantity < limits.min ? 0 : quantity);
  };

  return {
    quantity: line?.quantity ?? 0,
    limits,
    busy: mutation.isPending,
    /** Add: the buyer's minimum (or `qty` chosen on the product page) */
    add: (qty?: number) => setQuantity(Math.max(limits.min, qty ?? limits.min)),
    increase: () => setQuantity((line?.quantity ?? 0) + 1),
    decrease: () => setQuantity((line?.quantity ?? 0) - 1),
    remove: () => setQuantity(0),
  };
}
