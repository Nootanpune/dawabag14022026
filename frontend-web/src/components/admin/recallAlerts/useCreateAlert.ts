'use client';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { recallAlertKeys } from '@/lib/recallAlerts/api';
import type { AlertCreated } from '@/lib/recallAlerts/types';
import { getApiErrorMessage } from '@/lib/apiErrors';

/**
 * Sends a new alert (upload or typed in) and opens it. 422 (bad file / lines) and
 * 400 (received in the future) come back as the server's message.
 */
export function useCreateAlert<V>(send: (v: V) => Promise<AlertCreated>, onError: (msg: string) => void) {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: send,
    onSuccess: (a) => {
      queryClient.invalidateQueries({ queryKey: recallAlertKeys.all });
      toast.success(`${a.alert_no} entered · ${a.lines} line(s), ${a.matches} match(es) in our stock`);
      router.push(`/admin/recall-alerts/${a.id}`);
    },
    onError: (err) => onError(getApiErrorMessage(err, 'Could not enter the alert')),
  });
}
