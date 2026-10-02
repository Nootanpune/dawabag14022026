// The search results page keeps its state in the URL (/search?q=…&category=…&sort=…),
// so a search can be shared and the back button works — nothing is stored anywhere else.
import { SEARCH_SORTS, type SearchSort } from './api';

export interface SearchState {
  q: string;
  category: string;
  sort: SearchSort;
}

export function searchHref(s: Partial<SearchState>): string {
  const params = new URLSearchParams();
  const q = (s.q ?? '').trim();
  if (q) params.set('q', q);
  if (s.category) params.set('category', s.category);
  if (s.sort && s.sort !== 'relevance') params.set('sort', s.sort);
  const qs = params.toString();
  return qs ? `/search?${qs}` : '/search';
}

export function parseSearchState(params: URLSearchParams | { get(name: string): string | null }): SearchState {
  const sort = params.get('sort') ?? '';
  return {
    q: (params.get('q') ?? '').slice(0, 100),
    category: params.get('category') ?? '',
    sort: (SEARCH_SORTS as readonly string[]).includes(sort) ? (sort as SearchSort) : 'relevance',
  };
}
