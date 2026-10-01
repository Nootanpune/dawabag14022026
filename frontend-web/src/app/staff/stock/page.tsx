'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BATCH_PAGE_SIZE, fetchAdjustments, fetchBatches, stockControlKeys } from '@/lib/stock/api';
import { EXPIRY_TABS } from '@/lib/stock/labels';
import type { Batch, ExpiryFilter } from '@/lib/stock/types';
import { STORE_ROLES } from '@/lib/purchasing/roles';
import RequireAuth from '@/components/auth/RequireAuth';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import StatusTabs from '@/components/admin/StatusTabs';
import Pager from '@/components/admin/Pager';
import BatchTable from '@/components/staff/stock/BatchTable';
import AdjustDialog from '@/components/staff/stock/AdjustDialog';
import AdjustmentTable from '@/components/staff/stock/AdjustmentTable';

function StockScreen() {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [expiry, setExpiry] = useState<ExpiryFilter | ''>('');
  const [recalled, setRecalled] = useState(false);
  const [page, setPage] = useState(1);
  const [adjusting, setAdjusting] = useState<Batch | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(text.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [text]);

  const batches = useQuery({
    queryKey: stockControlKeys.batches(q, expiry, recalled, page),
    queryFn: () => fetchBatches(q, expiry, recalled, page),
  });
  const pending = useQuery({ queryKey: stockControlKeys.adjustments('requested'), queryFn: () => fetchAdjustments('requested') });
  const rows = batches.data?.batches ?? [];

  return (
    <div>
      <PageHeader
        title="Stock"
        subtitle="Stock on hand by batch, earliest expiry first. Expired and recalled batches are never sold."
        onRefresh={() => {
          batches.refetch();
          pending.refetch();
        }}
        refreshing={batches.isFetching || pending.isFetching}
      />
      <StatusTabs
        tabs={EXPIRY_TABS}
        value={expiry}
        onChange={(v) => {
          setExpiry(v);
          setPage(1);
        }}
      />
      <div className="flex flex-wrap items-center gap-4 mb-3">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search product, SKU or batch" className="input max-w-sm" />
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={recalled}
            onChange={(e) => {
              setRecalled(e.target.checked);
              setPage(1);
            }}
          />
          Recalled only
        </label>
      </div>
      <QueryState isLoading={batches.isLoading} error={batches.error} isEmpty={!rows.length} emptyText="No batches match" />
      {!!rows.length && <BatchTable batches={rows} onAdjust={setAdjusting} />}
      {batches.data && <Pager page={page} limit={BATCH_PAGE_SIZE} total={batches.data.total} onPage={setPage} />}

      <h2 className="text-sm font-semibold text-gray-700 mt-8 mb-2">
        Adjustments awaiting approval{pending.data ? ` · ${pending.data.length}` : ''}
      </h2>
      <QueryState isLoading={pending.isLoading} error={pending.error} isEmpty={!pending.data?.length} emptyText="Nothing waiting" />
      {!!pending.data?.length && <AdjustmentTable rows={pending.data} />}

      {adjusting && <AdjustDialog batch={adjusting} onClose={() => setAdjusting(null)} />}
    </div>
  );
}

export default function StockPage() {
  return (
    <RequireAuth roles={STORE_ROLES}>
      <StockScreen />
    </RequireAuth>
  );
}
