// Admin delivery confirmation for any seller's shipment (C-26), e.g. after the
// handover was locked by 5 wrong codes. Uses the staff order queue and order
// detail; POST /admin/shipments/:id/delivered accepts an override reason.
import api from '../api';
import type { HandoverInput } from '../fulfilment/handover';

export interface QueueOrder {
  id: string;
  order_number: string;
  status: string;
  total_paise: number;
  created_at: string;
  customer_name: string | null;
  item_count: number | string;
}

export const deliveryKeys = {
  dispatched: ['admin', 'deliveries', 'dispatched'] as const,
};

export async function fetchDispatchedOrders(): Promise<QueueOrder[]> {
  const { data } = await api.get('/orders/queue', { params: { status: 'dispatched', limit: 50 } });
  return data.data?.orders ?? [];
}

export async function adminMarkDelivered(shipmentId: string, handover: HandoverInput) {
  const { data } = await api.post(`/admin/shipments/${shipmentId}/delivered`, handover);
  return data.data as { id: string; status: string };
}
