'use client';
import type { ReactNode } from 'react';
import { SEARCH_EXAMPLES } from '@/lib/search/api';
import SearchCombobox from '@/components/search/SearchCombobox';
import { HOME_SEARCH_ID } from '@/components/search/HeaderSearch';

export { HOME_SEARCH_ID };

/** Headline and the main medicine search — the same search as the header's (Sprint 26):
 *  suggestions with Add as you type, Enter opens all results. */
export default function HomeHero({ note }: { note?: ReactNode }) {
  return (
    <section className="rounded-2xl bg-gradient-to-br from-brand-50 to-white border border-brand-100 px-4 py-4 sm:px-8 sm:py-8 mb-5">
      <h1 className="text-xl sm:text-3xl font-semibold text-gray-900 tracking-tight">
        Genuine medicines, checked by a pharmacist
      </h1>
      <p className="text-sm sm:text-base text-gray-600 mt-1 mb-3 sm:mb-4">
        Search by medicine name and get it delivered to your door.
      </p>
      <SearchCombobox
        id={HOME_SEARCH_ID}
        label="Search medicines"
        size="lg"
        scrollOnFocus
        // Real names from the catalogue only (Sprint 25)
        placeholder={`Try ${SEARCH_EXAMPLES[0]} or ${SEARCH_EXAMPLES[1]}`}
      />
      {note}
    </section>
  );
}
