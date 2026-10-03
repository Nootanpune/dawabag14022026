'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { buildUpdateBody, fetchPartner, formFromDetail, partnerKeys, updatePartner, type PartnerFormValues } from '@/lib/admin/partnerOnboarding';
import { getApiErrorMessage } from '@/lib/apiErrors';
import BackLink from '@/components/admin/BackLink';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import PartnerForm from '@/components/admin/partners/PartnerForm';
import PartnerLoginsCard from '@/components/admin/partners/PartnerLoginsCard';
import PartnerSummaryCard from '@/components/admin/partners/PartnerSummaryCard';
import ApiKeysPanel from '@/components/partnerApiKeys/ApiKeysPanel';

/** One partner: what it may sell, its logins, and its details to edit. */
export default function PartnerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const { data, isLoading, error: loadError } = useQuery({ queryKey: partnerKeys.detail(id), queryFn: () => fetchPartner(id) });

  const save = useMutation({
    mutationFn: (v: PartnerFormValues) => updatePartner(id, buildUpdateBody(v)),
    onSuccess: () => {
      toast.success('Partner saved');
      setError('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'partners'] });
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not save the partner')),
  });

  return (
    <div className="space-y-4">
      <BackLink href="/admin/partners" label="Partners" />
      <QueryState isLoading={isLoading} error={loadError} isEmpty={false} emptyText="" />
      {data && (
        <>
          <PageHeader title={data.legal_name} subtitle={[data.trade_name, data.city, data.state].filter(Boolean).join(' · ')} />
          <PartnerSummaryCard p={data} />
          <PartnerLoginsCard vendorId={data.id} logins={data.logins} />
          {/* Sprint 36: keys for the partner's billing software to upload its stock file */}
          <ApiKeysPanel owner={{ kind: 'admin', vendorId: data.id }} partnerId={data.id} />
          <h2 className="text-base font-semibold pt-2">Edit details</h2>
          <PartnerForm
            key={data.id}
            initial={formFromDetail(data)}
            mode="edit"
            prefixLocked={data.has_invoices}
            pending={save.isPending}
            error={error}
            submitLabel="Save changes"
            onSubmit={(v) => save.mutate(v)}
          />
        </>
      )}
    </div>
  );
}
