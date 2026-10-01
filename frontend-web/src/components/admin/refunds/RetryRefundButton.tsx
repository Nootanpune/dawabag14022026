'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { retryGatewayRefund, returnKeys, type Refund } from '@/lib/returns/api';
import { getApiErrorMessage } from '@/lib/apiErrors';

/** Send a refused gateway refund to Razorpay again (C-37). The server decides; 409 texts are shown as-is. */
export default function RetryRefundButton({ refund }: { refund: Refund }) {
  const queryClient = useQueryClient();
  const retry = useMutation({
    mutationFn: () => retryGatewayRefund(refund.id),
    onSuccess: (r) => {
      if (r.failure_reason) toast.error(`Razorpay refused it again: ${r.failure_reason}`);
      else if (r.status === 'processed') toast.success('Refund processed by Razorpay');
      else toast.success('Refund sent to Razorpay; waiting for its result');
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not send the refund again')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: returnKeys.all }),
  });
  return (
    <button
      onClick={() => retry.mutate()}
      disabled={retry.isPending}
      className="btn-primary text-xs py-1.5 px-3 whitespace-nowrap disabled:opacity-50"
    >
      {retry.isPending ? 'Sending…' : 'Retry with Razorpay'}
    </button>
  );
}
