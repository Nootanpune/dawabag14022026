'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cancelOrder, orderKeys } from '@/lib/orders/api';
import { returnKeys } from '@/lib/returns/api';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { formatPrice } from '@/lib/utils';
import ReasonDialog from '@/components/admin/ReasonDialog';

/** Buyer cancellation until packing starts (C-37); the server issues credit notes and refunds. */
export default function CancelOrderCard({ orderId }: { orderId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const cancel = useMutation({
    mutationFn: (reason: string) => cancelOrder(orderId, reason),
    onSuccess: (r) => {
      toast.success(r.refund_paise > 0 ? `Order cancelled · ${formatPrice(r.refund_paise)} will be refunded`
        : (r.released_paise ?? 0) > 0 ? 'Order cancelled · you have not been charged (the hold on your card or UPI is released)' : 'Order cancelled');
      setOpen(false);
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not cancel the order')),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: orderKeys.one(orderId) });
      queryClient.invalidateQueries({ queryKey: orderKeys.mine });
      queryClient.invalidateQueries({ queryKey: returnKeys.all });
    },
  });

  return (
    <div className="card mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="font-semibold text-sm">Changed your mind?</h3>
        <p className="text-xs text-gray-500">You can cancel until we start packing. Any amount paid is refunded.</p>
      </div>
      <button onClick={() => setOpen(true)} className="btn-outline text-sm text-red-600 border-red-200 hover:bg-red-50">
        Cancel order
      </button>
      {open && (
        <ReasonDialog
          title="Cancel this order"
          label="Why are you cancelling?"
          confirmLabel="Cancel order"
          minLength={3}
          pending={cancel.isPending}
          onClose={() => setOpen(false)}
          onConfirm={(reason) => cancel.mutate(reason)}
        />
      )}
    </div>
  );
}
