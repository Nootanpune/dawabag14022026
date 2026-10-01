'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { recallAlertKeys } from '@/lib/recallAlerts/api';
import { getApiErrorMessage } from '@/lib/apiErrors';

/**
 * A recall / clear decision on an alert (C-28). On success or a 409 (already
 * decided by someone else) the alert is re-read from the server.
 */
export function useAlertDecision<V>(
  send: (v: V) => Promise<unknown>,
  opts: { success: string; onDone: () => void; onError: (msg: string) => void }
) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: recallAlertKeys.all });
  return useMutation({
    mutationFn: send,
    onSuccess: () => {
      refresh();
      queryClient.invalidateQueries({ queryKey: ['recalls'] });
      toast.success(opts.success);
      opts.onDone();
    },
    onError: (err: any) => {
      if (err?.response?.status === 409) refresh();
      opts.onError(getApiErrorMessage(err, 'Could not save the decision'));
    },
  });
}
