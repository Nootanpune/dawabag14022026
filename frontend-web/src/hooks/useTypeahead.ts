'use client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useDebouncedValue } from './useDebouncedValue';
import { TYPEAHEAD_LIMIT, TYPEAHEAD_MIN_CHARS, searchKeys, searchProducts } from '@/lib/search/api';

/** Top matches from the server while the buyer types (debounced; 2+ characters). */
export function useTypeahead(query: string) {
  const debounced = useDebouncedValue(query.trim(), 250);
  const enabled = debounced.length >= TYPEAHEAD_MIN_CHARS;
  const result = useQuery({
    queryKey: searchKeys.typeahead(debounced),
    queryFn: () => searchProducts({ q: debounced, limit: TYPEAHEAD_LIMIT }),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  return {
    query: debounced,
    enabled,
    products: enabled ? result.data?.products ?? [] : [],
    total: enabled ? result.data?.pagination.total ?? 0 : 0,
    isFetching: enabled && result.isFetching,
    settled: enabled && !result.isFetching && debounced === query.trim(),
  };
}
