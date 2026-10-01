'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/authStore';
import { getApiErrorMessage } from '@/lib/apiErrors';
import {
  CART_QUERY_KEY,
  deleteCart,
  fetchCart,
  putCartCoupon,
  putCartItem,
  type CartView,
} from '@/lib/cart';

/** The signed-in user's server cart. Guests have no cart (query disabled). */
export function useCart() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: CART_QUERY_KEY,
    queryFn: fetchCart,
    enabled: isAuthenticated,
    staleTime: 0,
  });
}

/** Mutations that replace the cached CartView with the server's response. */
export function useCartMutations() {
  const queryClient = useQueryClient();
  const onSuccess = (cart: CartView) => queryClient.setQueryData(CART_QUERY_KEY, cart);
  const onError = (err: unknown) => {
    toast.error(getApiErrorMessage(err, 'Could not update cart'));
    queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY });
  };

  const setQuantity = useMutation({
    mutationFn: ({ productId, quantity }: { productId: string; quantity: number }) =>
      putCartItem(productId, quantity),
    onSuccess,
    onError,
  });

  // Coupon errors (400 + message) are shown by the caller next to the input.
  const setCoupon = useMutation({
    mutationFn: (code: string | null) => putCartCoupon(code),
    onSuccess,
  });

  const clear = useMutation({ mutationFn: deleteCart, onSuccess, onError });

  return { setQuantity, setCoupon, clear };
}

/** "Add to cart" = PUT current quantity + 1. Guests are sent to sign in. */
export function useAddToCart() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const mutation = useMutation({
    mutationFn: async ({ productId }: { productId: string; name: string }) => {
      const cart: CartView | undefined =
        queryClient.getQueryData<CartView>(CART_QUERY_KEY) ??
        (await queryClient.fetchQuery({ queryKey: CART_QUERY_KEY, queryFn: fetchCart }));
      const current = cart?.items.find((i) => i.product_id === productId)?.quantity ?? 0;
      return putCartItem(productId, current + 1);
    },
    onSuccess: (cart, { name }) => {
      queryClient.setQueryData(CART_QUERY_KEY, cart);
      toast.success(`${name} added to cart`);
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not add to cart')),
  });

  const addToCart = (productId: string, name: string) => {
    if (!isAuthenticated) {
      toast.info('Please sign in to add items to your cart');
      router.push('/auth/login');
      return;
    }
    mutation.mutate({ productId, name });
  };

  return { addToCart, isPending: mutation.isPending, pendingProductId: mutation.variables?.productId };
}
