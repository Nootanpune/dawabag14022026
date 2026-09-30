import api from '../api';

export interface OpenCreditOrder {
  id: string;
  order_number: string;
  total_paise: number;
  payment_terms: string;
  credit_due_date: string | null;
  days_to_due: number | null;
  user_id: string;
  business_name: string | null;
  mobile: string;
  credit_limit_paise: number;
  credit_used_paise: number;
}

export const creditKeys = { open: ['admin', 'credit', 'open'] as const };

export async function fetchOpenCredit(): Promise<OpenCreditOrder[]> {
  const { data } = await api.get('/admin/credit/open');
  return data.data?.orders ?? [];
}

export async function settleCredit(orderId: string, body: { payment_reference: string; notes?: string }) {
  const { data } = await api.post(`/orders/${orderId}/settle-credit`, body);
  return data.data as { order_id: string; settled: boolean; amount_paise: number };
}

export async function updateCreditLimit(userId: string, body: { credit_limit_paise: number; notes?: string }) {
  const { data } = await api.patch(`/admin/users/${userId}/credit`, body);
  return data.data as { credit_limit_paise: number; credit_used_paise: number };
}
