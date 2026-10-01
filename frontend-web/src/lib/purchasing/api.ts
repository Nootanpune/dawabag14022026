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
  ReceiptFilter,
  ReceiptPage,
  ReceiptResult,
  Supplier,
} from './types';

export const purchasingKeys = {
  // under ['admin','vendors'] so the vendor approval dialog refreshes it too
  suppliers: ['admin', 'vendors', 'suppliers'] as const,
  orders: (status: PoStatus | '') => ['purchasing', 'orders', status] as const,
  order: (id: string) => ['purchasing', 'orders', 'one', id] as const,
  receipts: (f: ReceiptFilter) => ['purchasing', 'receipts', f.from, f.to, f.vendor_id, f.q, f.page, f.limit] as const,
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

/** Paged, newest first; the server filters by receipt date, supplier and GRN / invoice number. */
export async function fetchReceipts(f: ReceiptFilter): Promise<ReceiptPage> {
  const { data } = await api.get(`${P}/receipts`, {
    params: {
      from: f.from || undefined,
      to: f.to || undefined,
      vendor_id: f.vendor_id || undefined,
      q: f.q || undefined,
      page: f.page,
      limit: f.limit,
    },
  });
  const d = data.data ?? {};
  return { receipts: d.receipts ?? [], total: Number(d.total ?? 0), page: Number(d.page ?? f.page), limit: Number(d.limit ?? f.limit) };
}

export async function fetchReceipt(id: string): Promise<Receipt> {
  const { data } = await api.get(`${P}/receipts/${id}`);
  return data.data;
}

export async function createReceipt(body: NewReceipt): Promise<ReceiptResult> {
  const { data } = await api.post(`${P}/receipts`, body);
  return data.data;
}
