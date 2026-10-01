'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchLowStock, stockKeys, type StockStatus } from '@/lib/admin/stock';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import StockStatusChips from '@/components/admin/stock/StockStatusChips';
import LowStockTable from '@/components/admin/stock/LowStockTable';

export default function LowStockPage() {
  const [status, setStatus] = useState<StockStatus | ''>('');
  // Counts always come from the unfiltered call so every chip shows its total.
  const all = useQuery({ queryKey: stockKeys.lowStock(''), queryFn: () => fetchLowStock('') });
  const filtered = useQuery({
    queryKey: stockKeys.lowStock(status),
    queryFn: () => fetchLowStock(status),
    enabled: status !== '',
  });
  const current = status === '' ? all : filtered;

  return (
    <div>
      <PageHeader
        title="Low stock"
        onRefresh={() => {
          all.refetch();
          if (status) filtered.refetch();
        }}
        refreshing={all.isFetching || filtered.isFetching}
      />
      <StockStatusChips counts={all.data?.counts ?? {}} selected={status} onSelect={setStatus} />
      <QueryState
        isLoading={current.isLoading}
        error={current.error}
        isEmpty={!current.data?.products.length}
        emptyText="Nothing below reorder level"
      />
      {!!current.data?.products.length && <LowStockTable products={current.data.products} />}
    </div>
  );
}
