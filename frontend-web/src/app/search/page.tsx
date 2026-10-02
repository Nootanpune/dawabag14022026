import { Suspense } from 'react';
import type { Metadata } from 'next';
import SearchResultsView from '@/components/search/SearchResultsView';

export const metadata: Metadata = { title: 'Search medicines | Dawabag', robots: { index: false } };

// The results page reads ?q=, ?category= and ?sort= in the browser (useSearchParams)
export default function SearchPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <SearchResultsView />
    </Suspense>
  );
}
