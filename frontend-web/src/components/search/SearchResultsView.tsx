'use client';
import { useEffect } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Search } from 'lucide-react';
import api from '@/lib/api';
import { searchKeys, searchProducts, SEARCH_EXAMPLES, type SearchSort } from '@/lib/search/api';
import { parseSearchState, searchHref, type SearchState } from '@/lib/search/searchUrl';
import Header from '@/components/layout/Header';
import Breadcrumbs from '@/components/layout/Breadcrumbs';
import ProductCard from '@/components/shop/ProductCard';
import EmptyState from '@/components/ui/EmptyState';
import type { Category } from '@/components/home/CategoryTiles';
import CategoryChips from './CategoryChips';
import SortSelect from './SortSelect';
import NoResults from './NoResults';
import { HEADER_SEARCH_ID } from './HeaderSearch';

const PAGE_SIZE = 24;

/** /search?q=…&category=…&sort=… — the URL is the state (shareable; back works). */
export default function SearchResultsView() {
  const router = useRouter();
  const state = parseSearchState(useSearchParams());
  const { q, category, sort } = state;
  const go = (next: Partial<SearchState>) => router.push(searchHref({ ...state, ...next }), { scroll: false });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => (await api.get('/products/categories')).data.data,
  });

  const searching = !!q || !!category;
  // Arriving with nothing to search (e.g. the phone's "Search" tab): ready to type
  useEffect(() => {
    if (!searching) document.getElementById(HEADER_SEARCH_ID)?.focus();
  }, [searching]);
  const results = useInfiniteQuery({
    queryKey: searchKeys.results(q, category, sort),
    queryFn: ({ pageParam }) => searchProducts({ q, category, sort, page: pageParam, limit: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.pagination.page < last.pagination.pages ? last.pagination.page + 1 : undefined),
    enabled: searching,
  });
  const products = results.data?.pages.flatMap((p) => p.products) ?? [];
  const total = results.data?.pages[0]?.pagination.total ?? 0;

  const heading = q ? `Results for “${q}”` : category || 'Search medicines';

  return (
    <div className="min-h-screen bg-gray-50">
      <Header searchQuery={q} />
      <main className="max-w-6xl mx-auto px-4 py-5 sm:py-6">
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Search', href: q || category ? '/search' : undefined }, ...(q || category ? [{ label: q ? `“${q}”` : category }] : [])]} />
        <h1 className="text-xl font-semibold text-gray-900">{heading}</h1>
        {searching && (
          <div className="mt-3 space-y-3">
            <CategoryChips categories={categories} selected={category} onSelect={(c) => go({ category: c })} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-gray-600" aria-live="polite">
                {results.isLoading ? 'Searching…' : `${total} medicine${total === 1 ? '' : 's'} found`}
              </p>
              <SortSelect value={sort} onChange={(s: SearchSort) => go({ sort: s })} />
            </div>
          </div>
        )}

        <div className="mt-4" aria-busy={results.isLoading}>
          {!searching ? (
            <EmptyState
              icon={Search}
              title="What are you looking for?"
              hint={`Type a medicine’s brand or generic name in the search box above, for example ${SEARCH_EXAMPLES.join(', ')}.`}
            />
          ) : results.isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" aria-label="Searching" /></div>
          ) : results.isError ? (
            <EmptyState icon={Search} title="Search is not available right now" hint="Please try again in a moment." action={{ label: 'Try again', onClick: () => results.refetch() }} />
          ) : products.length === 0 ? (
            <NoResults query={q || category} category={q ? category : ''} onClearCategory={() => go({ category: '' })} />
          ) : (
            <>
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-label="Search results">
                {products.map((p) => (
                  <li key={p.id} className="flex">
                    <div className="w-full"><ProductCard product={p} /></div>
                  </li>
                ))}
              </ul>
              {results.hasNextPage && (
                <div className="flex justify-center mt-6">
                  <button type="button" onClick={() => results.fetchNextPage()} disabled={results.isFetchingNextPage} className="btn-outline inline-flex items-center gap-2">
                    {results.isFetchingNextPage && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                    Show more results
                  </button>
                </div>
              )}
              <p className="mt-6 text-center text-xs text-gray-500">
                Showing {products.length} of {total}. Medicines marked Sch H / H1 need a prescription; our pharmacist checks it before dispatch.
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
