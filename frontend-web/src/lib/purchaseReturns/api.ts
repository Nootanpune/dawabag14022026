// Purchase returns to suppliers — /api/v1/purchasing/returns (C-28).
// Store staff raise and dispatch; a second admin approves (stock leaves the
// batches on approval) and records the supplier's credit note (C-46).
import api from '../api';
import type { NewPurchaseReturn, PurchaseReturn, PurchaseReturnRow, PurchaseReturnStatus, SupplierCreditNote } from './types';

export const purchaseReturnKeys = {
  all: ['purchasing', 'returns'] as const,
  list: (status: PurchaseReturnStatus | '') => ['purchasing', 'returns', status] as const,
  one: (id: string) => ['purchasing', 'returns', 'one', id] as const,
};

const R = '/purchasing/returns';

export async function fetchPurchaseReturns(status: PurchaseReturnStatus | ''): Promise<PurchaseReturnRow[]> {
  const { data } = await api.get(R, { params: status ? { status } : undefined });
  return data.data?.returns ?? [];
}

export async function fetchPurchaseReturn(id: string): Promise<PurchaseReturn> {
  const { data } = await api.get(`${R}/${id}`);
  return data.data;
}

export async function createPurchaseReturn(body: NewPurchaseReturn) {
  const { data } = await api.post(R, body);
  return data.data as { id: string; return_no: string; status: PurchaseReturnStatus; total_paise: number };
}

/** Admin decision; 403 when the decider raised the return (two-person rule, C-46). */
export async function decidePurchaseReturn(id: string, approve: boolean, notes: string) {
  await api.post(`${R}/${id}/decide`, { approve, notes });
}

/** Goods leave: e-way bill, LR or AWB number (3–100 characters). */
export async function dispatchPurchaseReturn(id: string, dispatch_reference: string) {
  await api.post(`${R}/${id}/dispatch`, { dispatch_reference });
}

/** difference_paise = supplier credit − return total (negative: the supplier credited less). */
export async function settlePurchaseReturn(id: string, body: SupplierCreditNote) {
  const { data } = await api.post(`${R}/${id}/settle`, body);
  return data.data as { id: string; status: 'settled'; difference_paise: number };
}
