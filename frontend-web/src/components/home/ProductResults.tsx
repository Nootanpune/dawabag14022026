'use client';
import { SearchX } from 'lucide-react';
import ProductCard from '@/components/shop/ProductCard';
import Link from 'next/link';
import EmptyState from '@/components/ui/EmptyState';
import NoResults from '@/components/search/NoResults';
import { searchHref } from '@/lib/search/searchUrl';

interface Props {
  products: any[] | undefined;
  isLoading: boolean;
  query: string;
  category: string;
  onReset: () => void;
}

function CardSkeleton() {
  return (
    <div className="card animate-pulse" aria-hidden="true">
      <div className="h-28 rounded-lg bg-gray-100 mb-3" />
      <div className="h-4 w-3/4 rounded bg-gray-100 mb-2" />
      <div className="h-3 w-1/2 rounded bg-gray-100 mb-4" />
      <div className="h-9 rounded-lg bg-gray-100" />
    </div>
  );
}

/** "Popular medicines" or search results, with loading skeletons and an empty state. */
export default function ProductResults({ products, isLoading, query, category, onReset }: Props) {
  const filtered = !!query || !!category;
  const heading = query ? `Results for “${query}”` : category ? category : 'Popular medicines';

  return (
    <section aria-labelledby="results-heading" aria-busy={isLoading}>
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h2 id="results-heading" className="text-base font-semibold text-gray-900">
          {heading}
        </h2>
        {query && !!products?.length && (
          <Link href={searchHref({ q: query, category })} className="text-sm font-medium text-brand-700 hover:underline">
            See all results
          </Link>
        )}
      </div>
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }, (_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : !products?.length && query ? (
        // "No medicines found for X", "Did you mean", tips and the prescription upload (Sprint 25)
        <NoResults query={query} category={category} onClearCategory={onReset} headingLevel="h3" />
      ) : !products?.length ? (
        <EmptyState
          icon={SearchX}
          as="h3"
          title={filtered ? 'No medicines match' : 'No medicines listed yet'}
          hint={
            filtered
              ? 'Check the spelling, try the generic name, or browse all medicines.'
              : 'Please check back soon.'
          }
          action={filtered ? { label: 'Show all medicines', onClick: onReset } : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </section>
  );
}
