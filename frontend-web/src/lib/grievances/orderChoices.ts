// Buyer's recent orders, offered when raising a complaint about an order.
import api from '../api';

export interface OrderChoice {
  id: string;
  order_number: string;
  created_at: string;
}

export async function fetchMyOrderChoices(): Promise<OrderChoice[]> {
  const { data } = await api.get('/orders/my', { params: { limit: 50 } });
  return (data.data?.orders ?? []).map((o: OrderChoice) => ({ id: o.id, order_number: o.order_number, created_at: o.created_at }));
}
