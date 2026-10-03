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
import Link from 'next/link';
import UrgentBadge from '@/components/stockFeed/UrgentBadge';
import { usePartnerFeedAlerts } from '@/components/stockFeed/PartnerFeedAlert';

/** Stock upload from the partner's billing software, and past uploads (Sprint 27). */
export default function StockImportPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const history = useQuery({ queryKey: stockImportKeys.list, queryFn: fetchStockImports });
  const me = useQuery({ queryKey: partnerKeys.me, queryFn: fetchPartnerMe });
  const feed = usePartnerFeedAlerts();
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
      {feed.data?.mode === 'live' && (
        <p className="text-sm bg-brand-50 border border-brand-100 rounded-lg p-3 flex flex-wrap items-center gap-2" data-testid="live-feed-banner">
          Your stock comes from your billing software (live feed): files uploaded here can be checked but not applied.
          <Link href="/partner/stock-feed" className="text-brand-700 underline font-medium">Live stock feed</Link>
          <UrgentBadge count={feed.data.waiting_checks} testId="import-urgent-badge" />
        </p>
      )}
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
