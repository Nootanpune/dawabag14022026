'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { EINVOICE_TABS, einvoiceKeys, fetchEinvoices, retryEinvoice } from '@/lib/einvoices/api';
import type { EinvoiceStatus } from '@/lib/einvoices/types';
import { MANAGER_ROLES } from '@/lib/admin/roles';
import { getApiErrorMessage } from '@/lib/apiErrors';
import RequireAuth from '@/components/auth/RequireAuth';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import StatusTabs from '@/components/admin/StatusTabs';
import EinvoiceCounts from '@/components/admin/einvoices/EinvoiceCounts';
import EinvoiceTable from '@/components/admin/einvoices/EinvoiceTable';

// GST e-invoices (IRN) for B2B invoices and credit notes (C-31). The server talks to the IRP.
function EinvoiceScreen() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<EinvoiceStatus | ''>('');
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: einvoiceKeys.list(status),
    queryFn: () => fetchEinvoices(status),
  });
  const retry = useMutation({
    mutationFn: retryEinvoice,
    onSuccess: (e) =>
      e?.status === 'generated'
        ? toast.success(`${e.doc_number}: IRN generated`)
        : toast.error(`${e?.doc_number ?? 'E-invoice'}: still ${e?.status ?? 'not registered'}${e?.error_message ? ` — ${e.error_message}` : ''}`),
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not retry the e-invoice')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: einvoiceKeys.all }),
  });
  const rows = data?.einvoices ?? [];

  return (
    <div>
      <PageHeader
        title="E-invoices"
        subtitle="IRN registration with the GST invoice registration portal for B2B invoices and credit notes (latest 300)"
        onRefresh={() => refetch()}
        refreshing={isFetching}
      />
      {data && !data.enabled && (
        <p className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          E-invoicing is off. Switch it on in Settings once aggregate turnover crosses the e-invoicing threshold (C-31).
        </p>
      )}
      {data && <EinvoiceCounts counts={data.counts} />}
      <StatusTabs tabs={EINVOICE_TABS} value={status} onChange={setStatus} />
      <QueryState isLoading={isLoading} error={error} isEmpty={!rows.length} emptyText="No e-invoices" />
      {!!rows.length && (
        <EinvoiceTable
          rows={rows}
          actions={(e) =>
            (e.status === 'failed' || e.status === 'pending') && (
              <button
                onClick={() => retry.mutate(e.id)}
                disabled={retry.isPending}
                className="btn-outline text-xs py-1.5 px-3 inline-flex items-center gap-1 disabled:opacity-50"
              >
                {retry.isPending && retry.variables === e.id && <Loader2 className="w-3 h-3 animate-spin" />} Retry
              </button>
            )
          }
        />
      )}
      <p className="text-xs text-gray-500 mt-3">
        Failed rows usually need data fixed first (buyer GSTIN, Dawabag GSTIN / address in legal entity settings, premises PIN code), then
        Retry. Dispatch of a B2B parcel waits until its invoice IRN is generated.
      </p>
    </div>
  );
}

export default function EinvoicesPage() {
  return (
    <RequireAuth roles={MANAGER_ROLES}>
      <EinvoiceScreen />
    </RequireAuth>
  );
}
