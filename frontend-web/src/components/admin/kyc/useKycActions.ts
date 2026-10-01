'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/apiErrors';
import type { KycDecisionResult } from '@/lib/admin/kyc';

/** Wraps a KYC decision call: toast the server's outcome and refetch the application + queue. */
export function useKycDecision<TBody>(userId: string, call: (body: TBody) => Promise<KycDecisionResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: call,
    onSuccess: (res) => {
      if (res?.account_activated) toast.success('Account activated');
      else toast.success(res?.verified ? 'Check marked verified' : 'Check marked failed');
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not save decision')),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'kyc'] });
    },
  });
}

export const CHECK_LABELS: Record<string, string> = {
  pan: 'PAN',
  gstin: 'GSTIN',
  nmc_registration: 'NMC / council registration',
};

export function checkLabel(check: string): string {
  if (CHECK_LABELS[check]) return CHECK_LABELS[check];
  if (check.startsWith('drug_license')) {
    const form = check.replace('drug_license_', '').toUpperCase();
    return `Drug licence${form && form !== 'DRUG_LICENSE' ? ` (${form.replace('DL', 'DL-')})` : ''}`;
  }
  return check.replace(/_/g, ' ');
}
