// How this server takes payment (GET /payments/options, Sprint 26) and the trial's demo
// payment. The server decides everything: Razorpay when its keys are set, a clearly
// labelled demo (no money moves) only on the owner's trial server, otherwise none.
import api from '../api';

export type PaymentMode = 'razorpay' | 'demo' | 'unavailable';
export type PaymentMethod = 'upi' | 'card' | 'netbanking' | 'wallet';

export interface PaymentOptions { mode: PaymentMode; methods: PaymentMethod[]; cash_on_delivery: boolean }

export const METHOD_LABELS: Record<PaymentMethod, { title: string; hint: string }> = {
  upi: { title: 'UPI', hint: 'Google Pay, PhonePe, Paytm, BHIM' },
  card: { title: 'Card', hint: 'Debit or credit card' },
  netbanking: { title: 'Netbanking', hint: 'All major banks' },
  wallet: { title: 'Wallet', hint: 'Paytm, Mobikwik and others' },
};

export const paymentKeys = { options: ['payments', 'options'] as const };

export async function fetchPaymentOptions(): Promise<PaymentOptions> {
  const { data } = await api.get('/payments/options');
  return data.data;
}

export interface DemoResult { paid: boolean; demo: true; status?: string; payment_status?: string }

export async function payOrderDemo(orderId: string, method: PaymentMethod, outcome: 'success' | 'failure'): Promise<DemoResult> {
  const { data } = await api.post('/payments/demo', { order_id: orderId, method, outcome });
  return data.data;
}

export async function payConsultationDemo(consultationId: string, method: PaymentMethod, outcome: 'success' | 'failure'): Promise<DemoResult> {
  const { data } = await api.post(`/consultations/${consultationId}/pay/demo`, { method, outcome });
  return data.data;
}
