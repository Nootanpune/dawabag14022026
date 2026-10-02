'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchPartnerImports, fetchProductRequests, partnerStockKeys, type ProductRequest } from '@/lib/admin/partnerStock';
import { formatDateTimeIST } from '@/lib/dates';
import { STATUS_LABEL } from '@/lib/partner/stockImport';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import StatusTabs from '@/components/admin/StatusTabs';
import ProductRequestList from '@/components/admin/partnerStock/ProductRequestList';
import DraftsCreatedDialog from '@/components/admin/partnerStock/DraftsCreatedDialog';
import type { DraftsCreated } from '@/lib/admin/catalogueDrafts';

const TABS = [
  { value: 'open', label: 'New product requests' },
  { value: 'drafted', label: 'Drafts being completed' },
  { value: 'linked', label: 'Linked' },
  { value: 'rejected', label: 'Closed' },
  { value: 'uploads', label: 'Stock uploads' },
] as const;
type Tab = (typeof TABS)[number]['value'];

/** Partner stock files (read-only) and the items partners asked Dawabag to add (Sprint 27);
 *  many requests become draft products at once for the pharmacist to complete (Sprint 29). */
export default function PartnerStockAdminPage() {
  const [tab, setTab] = useState<Tab>('open');
  const [created, setCreated] = useState<DraftsCreated | null>(null);
  const requests = useQuery({
    queryKey: partnerStockKeys.requests(tab),
    queryFn: () => fetchProductRequests(tab as ProductRequest['status']),
    enabled: tab !== 'uploads',
  });
  const uploads = useQuery({ queryKey: partnerStockKeys.imports, queryFn: fetchPartnerImports, enabled: tab === 'uploads' });

  return (
    <div>
      <PageHeader title="Partner stock files" subtitle="Stock uploaded by partner pharmacies, and items they asked us to add" />
      <StatusTabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'uploads' ? (
        <>
          <QueryState isLoading={uploads.isLoading} error={uploads.error} isEmpty={!uploads.data?.length} emptyText="No stock files uploaded yet" />
          {!!uploads.data?.length && (
            <ul className="card p-0 divide-y divide-gray-100 text-sm">
              {uploads.data.map((u) => (
                <li key={u.id} className="px-4 py-3 flex flex-wrap gap-x-4 gap-y-1">
                  <span className="font-medium flex-1 min-w-0">{u.partner_name} · {u.file_name}</span>
                  <span className="text-xs text-gray-500">{formatDateTimeIST(u.created_at)}</span>
                  <span className="text-xs text-gray-600">
                    {u.result ? `${u.result.lines_applied} lines applied` : u.summary ? `${u.summary.matched} matched / ${u.summary.lines} lines` : ''}
                  </span>
                  <span className="text-xs">{STATUS_LABEL[u.status]}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <QueryState isLoading={requests.isLoading} error={requests.error} isEmpty={!requests.data?.length} emptyText="Nothing here" />
          {!!requests.data?.length && <ProductRequestList requests={requests.data} open={tab === 'open'} onDraftsCreated={setCreated} />}
        </>
      )}
      {created && <DraftsCreatedDialog result={created} onClose={() => setCreated(null)} />}
    </div>
  );
}
