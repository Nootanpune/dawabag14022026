// How this server takes payment (GET /payments/options, Sprint 26) and the trial's demo
// payment. The server decides everything: Razorpay when its keys are set, a clearly
// labelled demo (no money moves) only on the owner's trial server, otherwise none.
import api from '../api';

export type PaymentMode = 'razorpay' | 'demo' | 'unavailable';
export type PaymentMethod = 'upi' | 'card' | 'netbanking' | 'wallet';

/** providers: the demo checkout's banks and wallets, sent by the server in demo mode only */
export interface PaymentOptions {
  mode: PaymentMode; methods: PaymentMethod[]; cash_on_delivery: boolean;
  providers?: { netbanking: string[]; wallet: string[] };
}

/** What the buyer chose in the demo checkout; provider = the bank or wallet (never card data). */
export interface DemoChoice { method: PaymentMethod; provider?: string }

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

/** payment_status 'authorized' (Sprint 39): a prescription order's demo payment is held until the pharmacist's check */
export interface DemoResult { paid: boolean; demo: true; status?: string; payment_status?: string; charge_note?: string }

export async function payOrderDemo(orderId: string, choice: DemoChoice, outcome: 'success' | 'failure'): Promise<DemoResult> {
  const { data } = await api.post('/payments/demo', { order_id: orderId, ...choice, outcome });
  return data.data;
}

export async function payConsultationDemo(consultationId: string, choice: DemoChoice, outcome: 'success' | 'failure'): Promise<DemoResult> {
  const { data } = await api.post(`/consultations/${consultationId}/pay/demo`, { ...choice, outcome });
  return data.data;
}

/** Sprint 44: the difference for an order change, in the trial's demo */
export async function payEditDemo(orderId: string, orderEditId: string, choice: DemoChoice, outcome: 'success' | 'failure'): Promise<DemoResult> {
  const { data } = await api.post('/payments/demo', { order_id: orderId, order_edit_id: orderEditId, ...choice, outcome });
  return data.data;
}

/** Sprint 44: a Razorpay order for the difference of an order change */
export async function createEditPayment(orderId: string, orderEditId: string) {
  const { data } = await api.post('/payments/create-order', { order_id: orderId, order_edit_id: orderEditId });
  return data.data as { razorpay_order_id: string; razorpay_key_id: string; amount: number; capture: 'now' | 'after_pharmacist_check' };
}
