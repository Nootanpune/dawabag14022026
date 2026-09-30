import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartItem {
  product_id: string;
  name: string;
  sku: string;
  quantity: number;
  unit_price_paise: number;
  mrp_paise: number;
  drug_schedule: string;
  max_qty: number;
  cold_chain: boolean;
  image_key?: string;
}

interface CartState {
  items: CartItem[];
  coupon_code: string | null;
  coupon_discount_paise: number;
  addItem: (item: Omit<CartItem, 'quantity'>) => void;
  removeItem: (product_id: string) => void;
  updateQty: (product_id: string, quantity: number) => void;
  clearCart: () => void;
  setCoupon: (code: string, discount_paise: number) => void;
  removeCoupon: () => void;
  subtotal: () => number;
  requiresPrescription: () => boolean;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      coupon_code: null,
      coupon_discount_paise: 0,

      addItem: (item) => {
        const existing = get().items.find((i) => i.product_id === item.product_id);
        if (existing) {
          const newQty = Math.min(existing.quantity + 1, item.max_qty);
          set((s) => ({
            items: s.items.map((i) =>
              i.product_id === item.product_id ? { ...i, quantity: newQty } : i
            ),
          }));
        } else {
          set((s) => ({ items: [...s.items, { ...item, quantity: 1 }] }));
        }
      },

      removeItem: (product_id) =>
        set((s) => ({ items: s.items.filter((i) => i.product_id !== product_id) })),

      updateQty: (product_id, quantity) => {
        if (quantity <= 0) {
          get().removeItem(product_id);
          return;
        }
        set((s) => ({
          items: s.items.map((i) =>
            i.product_id === product_id
              ? { ...i, quantity: Math.min(quantity, i.max_qty) }
              : i
          ),
        }));
      },

      clearCart: () => set({ items: [], coupon_code: null, coupon_discount_paise: 0 }),

      setCoupon: (code, discount_paise) =>
        set({ coupon_code: code, coupon_discount_paise: discount_paise }),

      removeCoupon: () => set({ coupon_code: null, coupon_discount_paise: 0 }),

      subtotal: () =>
        get().items.reduce((sum, i) => sum + i.unit_price_paise * i.quantity, 0),

      requiresPrescription: () =>
        get().items.some((i) => ['Schedule H', 'Schedule H1'].includes(i.drug_schedule)),
    }),
    { name: 'dawabag-cart' }
  )
);
