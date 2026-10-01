// Suppliers, purchase orders and goods receipts — /api/v1/purchasing/*.
// Every rule (licensed supplier C-02, MRP vs selling price C-16, shelf life,
// PO quantities) is enforced by the server; the UI only collects input.
import api from '../api';
import type {
  NewPurchaseOrder,
  NewReceipt,
  NewSupplier,
  PoStatus,
  PurchaseOrder,
  PurchaseOrderRow,
  Receipt,
  ReceiptResult,
  ReceiptRow,
  Supplier,
} from './types';

export const purchasingKeys = {
  // under ['admin','vendors'] so the vendor approval dialog refreshes it too
  suppliers: ['admin', 'vendors', 'suppliers'] as const,
  orders: (status: PoStatus | '') => ['purchasing', 'orders', status] as const,
  order: (id: string) => ['purchasing', 'orders', 'one', id] as const,
  receipts: (from: string, to: string) => ['purchasing', 'receipts', from, to] as const,
  receipt: (id: string) => ['purchasing', 'receipts', 'one', id] as const,
};

const P = '/purchasing';

export async function fetchSuppliers(): Promise<Supplier[]> {
  const { data } = await api.get(`${P}/suppliers`);
  return data.data?.suppliers ?? [];
}

export async function createSupplier(body: NewSupplier): Promise<{ id: string; name: string }> {
  const { data } = await api.post(`${P}/suppliers`, body);
  return data.data;
}

export async function fetchPurchaseOrders(status: PoStatus | ''): Promise<PurchaseOrderRow[]> {
  const { data } = await api.get(`${P}/purchase-orders`, { params: status ? { status } : undefined });
  return data.data?.purchase_orders ?? [];
}

export async function fetchPurchaseOrder(id: string): Promise<PurchaseOrder> {
  const { data } = await api.get(`${P}/purchase-orders/${id}`);
  return data.data;
}

export async function createPurchaseOrder(body: NewPurchaseOrder): Promise<{ id: string; po_number: string }> {
  const { data } = await api.post(`${P}/purchase-orders`, body);
  return data.data;
}

export async function approvePurchaseOrder(id: string) {
  await api.post(`${P}/purchase-orders/${id}/approve`);
}

export async function cancelPurchaseOrder(id: string, reason: string) {
  await api.post(`${P}/purchase-orders/${id}/cancel`, { reason });
}

/** Close a partially received PO short */
export async function closePurchaseOrder(id: string, reason: string) {
  await api.post(`${P}/purchase-orders/${id}/close`, { reason });
}

export async function fetchReceipts(from: string, to: string): Promise<ReceiptRow[]> {
  const { data } = await api.get(`${P}/receipts`, { params: from && to ? { from, to } : undefined });
  return data.data?.receipts ?? [];
}

export async function fetchReceipt(id: string): Promise<Receipt> {
  const { data } = await api.get(`${P}/receipts/${id}`);
  return data.data;
}

export async function createReceipt(body: NewReceipt): Promise<ReceiptResult> {
  const { data } = await api.post(`${P}/receipts`, body);
  return data.data;
}
