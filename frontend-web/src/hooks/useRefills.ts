'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  cancelMandate,
  cancelRefill,
  fetchMandates,
  fetchRefills,
  refillKeys,
  updateRefill,
  type RefillChanges,
} from '@/lib/refills';
import { getApiErrorMessage } from '@/lib/apiErrors';

export function useRefills() {
  return useQuery({ queryKey: refillKeys.list, queryFn: fetchRefills });
}

export function useMandates() {
  return useQuery({ queryKey: refillKeys.mandates, queryFn: fetchMandates });
}

/** Refill + mandate mutations; every one refetches server state afterwards. */
export function useRefillActions() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: refillKeys.all });

  const update = useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: RefillChanges; message?: string }) => updateRefill(id, changes),
    onSuccess: (_r, v) => toast.success(v.message ?? 'Refill updated'),
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not update refill')),
    onSettled: refresh,
  });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelRefill(id),
    onSuccess: () => toast.success('Refill cancelled'),
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not cancel refill')),
    onSettled: refresh,
  });

  const removeMandate = useMutation({
    mutationFn: (id: string) => cancelMandate(id),
    onSuccess: () => toast.success('Automatic payment turned off'),
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not turn off automatic payment')),
    onSettled: refresh,
  });

  return { update, cancel, removeMandate, refresh };
}
