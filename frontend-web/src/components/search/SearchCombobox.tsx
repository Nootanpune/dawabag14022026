'use client';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Search, X, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTypeahead } from '@/hooks/useTypeahead';
import { SEARCH_PLACEHOLDER, TYPEAHEAD_MIN_CHARS } from '@/lib/search/api';
import { searchHref } from '@/lib/search/searchUrl';
import TypeaheadOption from './TypeaheadOption';

interface Props {
  /** input id (also names the listbox) */
  id: string;
  /** accessible name of the search box */
  label: string;
  placeholder?: string;
  /** e.g. the query of the results page being shown */
  initialQuery?: string;
  size?: 'md' | 'lg';
  className?: string;
  /** Enter with nothing highlighted, or "See all results"; defaults to the results page */
  onSubmitQuery?: (q: string) => void;
  /** On a phone, scroll the box to the top when focused so the suggestions fit on screen */
  scrollOnFocus?: boolean;
}

/**
 * Medicine search with suggestions from the server as you type (ARIA 1.2 combobox
 * + listbox): ↑/↓ move, Enter opens the highlighted medicine or all results, Esc
 * closes. In-stock items have a quick "Add" that updates the server cart.
 */
export default function SearchCombobox({ id, label, placeholder = SEARCH_PLACEHOLDER, initialQuery = '', size = 'md', className, onSubmitQuery, scrollOnFocus }: Props) {
  const router = useRouter();
  const listId = `${id}-list`;
  const statusId = useId();
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const { products, total, isFetching, settled, enabled } = useTypeahead(query);

  useEffect(() => setQuery(initialQuery), [initialQuery]);
  const resultKey = products.map((p) => p.id).join(',');
  useEffect(() => setActive(-1), [resultKey]);

  const trimmed = query.trim();
  const showList = open && trimmed.length >= TYPEAHEAD_MIN_CHARS && enabled;
  const seeAllIndex = products.length;           // the last option
  const optionId = (i: number) => `${id}-opt-${i}`;

  const submit = (q = trimmed) => {
    if (!q) return;
    setOpen(false);
    if (onSubmitQuery) onSubmitQuery(q);
    else router.push(searchHref({ q }));
  };
  const openProduct = (productId: string) => {
    setOpen(false);
    router.push(`/shop/${productId}`);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!showList) { setOpen(true); return; }
      e.preventDefault();
      const n = seeAllIndex + 1;
      setActive((a) => (e.key === 'ArrowDown' ? (a + 1) % n : (a <= 0 ? n - 1 : a - 1)));
    } else if (e.key === 'Escape') {
      if (showList) { e.preventDefault(); setOpen(false); setActive(-1); }
      else if (query) setQuery('');
    } else if (e.key === 'Enter' && showList && active >= 0 && active < seeAllIndex) {
      e.preventDefault();
      openProduct(products[active].id);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  const status = !showList ? '' : isFetching && !products.length ? 'Searching…'
    : settled && !total ? `No medicines found for ${trimmed}` : products.length ? `${total} medicine${total === 1 ? '' : 's'} found` : '';

  return (
    <div
      ref={boxRef}
      className={cn('relative', className)}
      onBlur={(e) => { if (!boxRef.current?.contains(e.relatedTarget as Node)) setOpen(false); }}
    >
      <form role="search" onSubmit={onSubmit} className="relative">
        <label htmlFor={id} className="sr-only">{label}</label>
        <Search className={cn('absolute top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none', size === 'lg' ? 'left-4 w-5 h-5' : 'left-3 w-4 h-4')} aria-hidden="true" />
        <input
          id={id}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? optionId(active) : undefined}
          aria-describedby={statusId}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={(e) => {
            setOpen(true);
            if (scrollOnFocus && window.matchMedia('(max-width: 767px)').matches) e.currentTarget.scrollIntoView({ block: 'start', behavior: 'smooth' });
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          enterKeyHint="search"
          className={cn(
            'w-full scroll-mt-20 rounded-full border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500',
            size === 'lg' ? 'pl-12 pr-11 py-3.5 text-base shadow-sm' : 'pl-9 pr-9 py-2 text-sm',
          )}
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(''); setOpen(false); }}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-gray-500 hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </form>
      <p id={statusId} className="sr-only" aria-live="polite">{status}</p>

      {/* The listbox is always in the page (aria-controls must point at it); it only shows when open */}
      <ul
        id={listId}
        role="listbox"
        aria-label={`Suggestions for ${trimmed || 'your search'}`}
        hidden={!showList}
        className="absolute z-50 left-0 right-0 lg:min-w-[30rem] mt-1 max-h-[70vh] overflow-auto rounded-xl border border-gray-200 bg-white shadow-lg py-1"
      >
        {showList && products.map((p, i) => (
          <TypeaheadOption
            key={p.id}
            id={optionId(i)}
            product={p}
            active={active === i}
            onHover={() => setActive(i)}
            onOpen={() => openProduct(p.id)}
          />
        ))}
        {showList && settled && !products.length && (
          <li role="presentation" className="px-3 py-2 text-sm text-gray-600">No medicines found for “{trimmed}”.</li>
        )}
        {showList && isFetching && !products.length && (
          <li role="presentation" className="px-3 py-2 text-sm text-gray-500 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Searching…
          </li>
        )}
        {showList && (
          <li
            id={optionId(seeAllIndex)}
            role="option"
            aria-selected={active === seeAllIndex}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setActive(seeAllIndex)}
            onClick={() => submit()}
            className={cn('flex items-center justify-between gap-2 px-3 py-2 border-t border-gray-100 text-sm font-medium text-brand-700 cursor-pointer',
              active === seeAllIndex ? 'bg-brand-50' : 'hover:bg-gray-50')}
          >
            See all results for “{trimmed}” <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </li>
        )}
      </ul>
    </div>
  );
}
