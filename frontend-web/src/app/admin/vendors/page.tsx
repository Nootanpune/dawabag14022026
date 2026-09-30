'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchPendingVendors, rejectVendor, vendorKeys, type PendingVendor } from '@/lib/admin/vendors';
import { getApiErrorMessage } from '@/lib/apiErrors';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import ReasonDialog from '@/components/admin/ReasonDialog';
import PendingVendorsTable from '@/components/admin/vendors/PendingVendorsTable';
import ApproveVendorDialog from '@/components/admin/vendors/ApproveVendorDialog';

export default function VendorsPage() {
  const queryClient = useQueryClient();
  const [approving, setApproving] = useState<PendingVendor | null>(null);
  const [rejecting, setRejecting] = useState<PendingVendor | null>(null);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: vendorKeys.pending,
    queryFn: fetchPendingVendors,
  });

  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => rejectVendor(id, reason),
    onSuccess: () => {
      toast.success('Vendor rejected');
      setRejecting(null);
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not reject vendor')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'vendors'] }),
  });

  return (
    <div>
      <PageHeader
        title="Vendors"
        subtitle={`Pending approval${data ? ` · ${data.length}` : ''}`}
        onRefresh={() => refetch()}
        refreshing={isFetching}
      />
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No vendors awaiting approval" />
      {!!data?.length && <PendingVendorsTable vendors={data} onApprove={setApproving} onReject={setRejecting} />}

      {approving && <ApproveVendorDialog vendor={approving} onClose={() => setApproving(null)} />}
      {rejecting && (
        <ReasonDialog
          title={`Reject ${rejecting.name}`}
          confirmLabel="Reject vendor"
          pending={reject.isPending}
          onClose={() => setRejecting(null)}
          onConfirm={(reason) => reject.mutate({ id: rejecting.id, reason })}
        />
      )}
    </div>
  );
}
