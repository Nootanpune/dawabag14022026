'use client';
import { toast } from 'sonner';
import { useAddToCart } from './useCart';
import { cannotOrderOnline } from '@/lib/search/api';

/** "Add to cart" for a listed product: refuses what cannot be sold online (C-10) or is out of stock; the server checks again. */
export function useAddProduct() {
  const { addToCart, isPending, pendingProductId } = useAddToCart();
  const add = (product: { id: string; name: string; drug_schedule: string; in_stock: boolean }) => {
    if (cannotOrderOnline(product.drug_schedule)) {
      toast.error('This medicine cannot be ordered online.');
      return;
    }
    if (!product.in_stock) {
      toast.error('Out of stock');
      return;
    }
    addToCart(product.id, product.name);
  };
  return { add, pendingProductId: isPending ? pendingProductId : undefined };
}
