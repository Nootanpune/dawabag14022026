// Catalogue look-up for purchase orders and receipts. Admins search the full
// catalogue (GET /products/admin/list, includes inactive products); other store
// staff can only use the public search (active products).
import api from '../api';

export interface CatalogueHit {
  id: string;
  name: string;
  sku: string;
  drug_schedule: string | null;
}

export const productSearchKeys = {
  search: (scope: 'admin' | 'public', q: string) => ['purchasing', 'product-search', scope, q] as const,
};

export async function searchCatalogue(scope: 'admin' | 'public', q: string): Promise<CatalogueHit[]> {
  const { data } =
    scope === 'admin'
      ? await api.get('/products/admin/list', { params: { q, page: 1, limit: 10 } })
      : await api.get('/products/search', { params: { q, limit: 10 } });
  return data.data?.products ?? [];
}

/** Schedule X and NDPS are never stocked for online sale; the server refuses them too. */
export function isNeverStocked(schedule: string | null | undefined): boolean {
  return ['Schedule X', 'NDPS'].includes((schedule ?? '').trim());
}
