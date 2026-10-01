'use client';
import { useQuery } from '@tanstack/react-query';
import { fetchLegalInfo, legalKeys } from '@/lib/legal/api';

/** Legal details from GET /legal/info (public, no auth). */
export function useLegalInfo() {
  return useQuery({ queryKey: legalKeys.info, queryFn: fetchLegalInfo, staleTime: 5 * 60 * 1000 });
}
