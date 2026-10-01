'use client';
import type { RefObject } from 'react';
import { Search, X } from 'lucide-react';

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}

export const HOME_SEARCH_ID = 'home-search';

/** Headline and the main medicine search. */
export default function HomeHero({ query, onQueryChange, inputRef }: Props) {
  return (
    <section className="rounded-2xl bg-gradient-to-br from-brand-50 to-white border border-brand-100 px-4 py-6 sm:px-8 sm:py-8 mb-5">
      <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 tracking-tight">
        Genuine medicines, checked by a pharmacist
      </h1>
      <p className="text-sm sm:text-base text-gray-600 mt-1.5 mb-4">
        Search by brand or generic name and get them delivered to your door.
      </p>
      <div className="relative" role="search">
        <label htmlFor={HOME_SEARCH_ID} className="sr-only">
          Search medicines
        </label>
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" aria-hidden="true" />
        <input
          ref={inputRef}
          id={HOME_SEARCH_ID}
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Try Dolo 650 or paracetamol"
          autoComplete="off"
          className="w-full pl-12 pr-11 py-3.5 rounded-xl border border-gray-300 bg-white text-base
                     focus:outline-none focus:ring-2 focus:ring-brand-400 shadow-sm scroll-mt-24"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange('')}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-gray-500 hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </section>
  );
}
