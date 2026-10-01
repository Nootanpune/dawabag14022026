import api from '../api';

export const STOCK_STATUSES = ['OUT OF STOCK', 'REORDER NOW', 'LOW STOCK'] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];

export interface LowStockProduct {
  id: string;
  name: string;
  sku: string;
  category: string | null;
  reorder_level_qty: number;
  current_stock: number | string;
  preferred_vendor_id: string | null;
  preferred_vendor_name: string | null;
  stock_status: StockStatus;
  last_alert_at: string | null;
}

export interface LowStockData {
  products: LowStockProduct[];
  counts: Partial<Record<StockStatus, number>>;
}

export const stockKeys = { lowStock: (status: StockStatus | '') => ['admin', 'stock', status] as const };

export async function fetchLowStock(status: StockStatus | ''): Promise<LowStockData> {
  const { data } = await api.get('/inventory/low-stock', { params: status ? { status } : undefined });
  return { products: data.data?.products ?? [], counts: data.data?.counts ?? {} };
}
