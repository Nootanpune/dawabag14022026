'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createCategory, createHsnCode, fetchCategoryList, fetchHsnList, listKeys,
} from '@/lib/catalogueLists';

/** The category list from the server (cached for the page only, refetched after an addition). */
export function useCategoryList() {
  return useQuery({ queryKey: listKeys.categories, queryFn: fetchCategoryList, staleTime: 60_000 });
}

export function useHsnList() {
  return useQuery({ queryKey: listKeys.hsn, queryFn: fetchHsnList, staleTime: 60_000 });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createCategory,
    onSuccess: () => qc.invalidateQueries({ queryKey: listKeys.categories }),
  });
}

export function useCreateHsn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createHsnCode,
    onSuccess: () => qc.invalidateQueries({ queryKey: listKeys.hsn }),
  });
}
