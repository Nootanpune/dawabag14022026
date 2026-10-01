'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { bookCourier, fulfilmentKeys } from '@/lib/fulfilment/api';
import type { QueueShipment } from '@/lib/fulfilment/types';
import { getApiErrorMessage } from '@/lib/apiErrors';

/** Books a packed shipment with Shiprocket; the AWB is stored on the server and shown on the card. */
export default function BookCourierButton({ shipment }: { shipment: QueueShipment }) {
  const queryClient = useQueryClient();
  const book = useMutation({
    mutationFn: () => bookCourier(shipment.shipment_id),
    onSuccess: (r) => toast.success(`${shipment.order_number} booked with ${r.courier_partner} · AWB ${r.awb_number}`),
    // 409 manual booking / not packed / already booked, 503 not configured, 502 provider error
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not book the courier')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: fulfilmentKeys.all }),
  });

  return (
    <button
      type="button"
      onClick={() => book.mutate()}
      disabled={book.isPending}
      className="btn-outline text-xs py-1.5 px-3 inline-flex items-center gap-1 disabled:opacity-50"
    >
      {book.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Truck className="w-3.5 h-3.5" />} Book courier (Shiprocket)
    </button>
  );
}
