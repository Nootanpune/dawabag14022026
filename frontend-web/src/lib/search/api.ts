// Catalogue search from the server (GET /products/search). The server decides what
// matches, the order, the buyer's price and the stock; Schedule X / NDPS are never
// returned (C-10). Nothing is kept in the browser: React Query holds the answer in
// memory for this page only.
import api from '../api';
import type { BuyerRestrictionFields } from '@/lib/shop/buyerRestriction';

export const SEARCH_SORTS = ['relevance', 'price_asc', 'price_desc'] as const;
export type SearchSort = typeof SEARCH_SORTS[number];

export const SORT_LABELS: Record<SearchSort, string> = {
  relevance: 'Best match',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
};

/** Sprint 47: buyer_restriction, its label and buyer_may_buy come with every product */
export interface SearchProduct extends BuyerRestrictionFields {
  id: string;
  name: string;
  generic_name?: string | null;
  sku: string;
  category?: string | null;
  marketed_by?: string;
  drug_schedule: string;
  mrp_paise: number;
  offer_price_paise: number;
  /** the signed-in buyer's own price (offer / PTR / PTS / institutional) */
  display_price_paise: number;
  discount_pct: number;
  in_stock: boolean;
  cold_chain: boolean;
  max_qty_per_order: number;
  image_url?: string | null;
}

export interface SearchPage {
  products: SearchProduct[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export interface SearchParams {
  q?: string;
  category?: string;
  sort?: SearchSort;
  page?: number;
  limit?: number;
  pincode?: string | null;
}

export async function searchProducts(p: SearchParams): Promise<SearchPage> {
  const params = new URLSearchParams();
  if (p.q) params.set('q', p.q);
  if (p.category) params.set('category', p.category);
  if (p.sort && p.sort !== 'relevance') params.set('sort', p.sort);
  if (p.pincode) params.set('pincode', p.pincode);
  params.set('page', String(p.page ?? 1));
  params.set('limit', String(p.limit ?? 20));
  const { data } = await api.get(`/products/search?${params}`);
  return { products: data.data?.products ?? [], pagination: data.data?.pagination ?? { page: 1, limit: 20, total: 0, pages: 0 } };
}

/** "Did you mean" names for a search that found nothing (server side, C-10 applied). */
export async function fetchSuggestions(q: string): Promise<string[]> {
  const { data } = await api.get(`/products/search/suggest?q=${encodeURIComponent(q)}`);
  return data.data?.suggestions ?? [];
}

export const searchKeys = {
  typeahead: (q: string) => ['search', 'typeahead', q] as const,
  results: (q: string, category: string, sort: SearchSort) => ['search', 'results', q, category, sort] as const,
  suggest: (q: string) => ['search', 'suggest', q] as const,
  popular: ['search', 'popular'] as const,
};

/** Typeahead starts after this many characters. */
export const TYPEAHEAD_MIN_CHARS = 2;
export const TYPEAHEAD_LIMIT = 6;

/** Example searches in hints: common generic names, not brands that a catalogue may not carry. */
export const SEARCH_EXAMPLES = ['paracetamol', 'cetirizine', 'pantoprazole'] as const;
export const SEARCH_PLACEHOLDER = 'Search medicines, e.g. paracetamol';

/** Schedule X / NDPS are never sold online (C-10); the server never lists them either. */
export const cannotOrderOnline = (schedule: string | null | undefined) => ['NDPS', 'Schedule X'].includes(schedule ?? '');
