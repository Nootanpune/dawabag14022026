'use client';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { fetchStockImports, stockImportKeys, uploadStockFile } from '@/lib/partner/stockImport';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import StockFileDrop from '@/components/partner/stockImport/StockFileDrop';
import ImportHistory from '@/components/partner/stockImport/ImportHistory';
import ApiKeysPanel from '@/components/partnerApiKeys/ApiKeysPanel';
import { fetchPartnerMe, partnerKeys } from '@/lib/partner/api';

/** Stock upload from the partner's billing software, and past uploads (Sprint 27). */
export default function StockImportPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const history = useQuery({ queryKey: stockImportKeys.list, queryFn: fetchStockImports });
  const me = useQuery({ queryKey: partnerKeys.me, queryFn: fetchPartnerMe });
  const upload = useMutation({
    mutationFn: uploadStockFile,
    onSuccess: (imp) => {
      queryClient.setQueryData(stockImportKeys.one(imp.id), imp);
      queryClient.invalidateQueries({ queryKey: stockImportKeys.list });
      router.push(`/partner/stock-import/${imp.id}`);
    },
  });

  return (
    <div className="space-y-5">
      <PageHeader title="Upload stock" subtitle="Update your stock on Dawabag from your billing software's stock report" />
      <StockFileDrop pending={upload.isPending} onUpload={(f) => upload.mutate(f)} />
      {upload.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3" role="alert">
          {getApiErrorMessage(upload.error, 'Could not read the file')}
        </p>
      )}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-700">Past uploads</h2>
        <QueryState
          isLoading={history.isLoading}
          error={history.error}
          isEmpty={!history.data?.length}
          emptyText="No stock files uploaded yet"
        />
        {!!history.data?.length && <ImportHistory imports={history.data} />}
      </section>
      {/* Sprint 36: the billing software can send the file itself — keys for the owner login only */}
      {me.data?.is_owner && <ApiKeysPanel owner={{ kind: 'partner' }} partnerId={me.data.id} />}
    </div>
  );
}
