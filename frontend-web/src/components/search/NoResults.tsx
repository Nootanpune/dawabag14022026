'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { SearchX, FileUp } from 'lucide-react';
import { fetchSuggestions, searchKeys, searchProducts, SEARCH_EXAMPLES } from '@/lib/search/api';
import { searchHref } from '@/lib/search/searchUrl';
import ProductCard from '@/components/shop/ProductCard';

interface Props {
  query: string;
  category?: string;
  /** clears the category filter when one is set */
  onClearCategory?: () => void;
  headingLevel?: 'h2' | 'h3';
}

/**
 * A search that found nothing: say so plainly, offer close names from the server
 * ("Did you mean"), tips, the prescription upload, and medicines we do have.
 */
export default function NoResults({ query, category, onClearCategory, headingLevel: H = 'h2' }: Props) {
  const { data: suggestions = [] } = useQuery({
    queryKey: searchKeys.suggest(query),
    queryFn: () => fetchSuggestions(query),
    enabled: query.trim().length >= 2,
    staleTime: 60_000,
  });
  const { data: popular } = useQuery({
    queryKey: searchKeys.popular,
    queryFn: () => searchProducts({ limit: 6 }),
    staleTime: 60_000,
  });

  return (
    <section aria-labelledby="no-results-heading" className="py-6">
      <div className="flex flex-col items-center text-center px-4">
        <div className="w-16 h-16 rounded-2xl bg-brand-50 flex items-center justify-center mb-4">
          <SearchX className="w-8 h-8 text-brand-600" aria-hidden="true" />
        </div>
        <H id="no-results-heading" className="text-lg font-semibold text-gray-800">
          No medicines found for “{query}”{category ? ` in ${category}` : ''}
        </H>
        {suggestions.length > 0 && (
          <div className="mt-3 text-sm text-gray-700">
            <p>Did you mean:</p>
            <ul className="mt-1 flex flex-wrap justify-center gap-2">
              {suggestions.map((s) => (
                <li key={s}>
                  <Link href={searchHref({ q: s, category })} className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800">
                    {s}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-gray-500">Check that the name matches your prescription exactly.</p>
          </div>
        )}
        <ul className="mt-4 text-sm text-gray-600 text-left list-disc pl-5 space-y-1 max-w-md">
          <li>Check the spelling, or type fewer letters (for example “{query.slice(0, 4) || 'para'}”).</li>
          <li>Search by the generic (salt) name printed on the pack, such as {SEARCH_EXAMPLES.join(', ')}.</li>
          {category && onClearCategory && (
            <li>
              <button type="button" onClick={onClearCategory} className="text-brand-700 underline underline-offset-2">
                Search all categories
              </button>
            </li>
          )}
        </ul>
        <Link href="/prescriptions" className="btn-outline mt-5 inline-flex items-center gap-2">
          <FileUp className="w-4 h-4" aria-hidden="true" /> Upload a prescription instead
        </Link>
        <p className="mt-2 text-xs text-gray-500 max-w-sm">Keep it ready: you add the medicines on it to your cart, and our pharmacist checks it before packing.</p>
      </div>

      {!!popular?.products.length && (
        <div className="mt-8">
          <H className="text-base font-semibold text-gray-900 mb-3">Popular medicines</H>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {popular.products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
