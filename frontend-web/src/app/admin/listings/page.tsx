'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  approveListing,
  fetchListingQueue,
  listingKeys,
  postListingLive,
  rejectListing,
  type ListingForReview,
} from '@/lib/admin/listings';
import { hasRole, MANAGER_ROLES } from '@/lib/admin/roles';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { useAuthStore } from '@/store/authStore';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import ListingReviewRow from '@/components/admin/listings/ListingReviewRow';
import RejectListingDialog from '@/components/admin/listings/RejectListingDialog';

type Action = { kind: 'approve' | 'live'; l: ListingForReview };

export default function ListingReviewPage() {
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const [rejecting, setRejecting] = useState<ListingForReview | null>(null);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: listingKeys.queue,
    queryFn: fetchListingQueue,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'listings'] });

  const act = useMutation({
    mutationFn: ({ kind, l }: Action) => (kind === 'approve' ? approveListing(l.id) : postListingLive(l.id)),
    onSuccess: (_r, { kind, l }) => toast.success(`${l.medicine_name} ${kind === 'approve' ? 'approved' : 'is live'}`),
    onError: (err) => toast.error(getApiErrorMessage(err, 'Action failed')),
    onSettled: invalidate,
  });

  const reject = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof rejectListing>[1] }) => rejectListing(id, body),
    onSuccess: () => {
      toast.success('Listing rejected');
      setRejecting(null);
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not reject listing')),
    onSettled: invalidate,
  });

  return (
    <div>
      <PageHeader
        title="Partner listings"
        subtitle={`Awaiting review or go-live${data ? ` · ${data.length}` : ''}`}
        onRefresh={() => refetch()}
        refreshing={isFetching}
      />
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No listings awaiting review" />
      {!!data?.length && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
                <th className="font-medium px-4 py-2.5">Product</th>
                <th className="font-medium px-4 py-2.5">Partner</th>
                <th className="font-medium px-4 py-2.5">H1 declaration</th>
                <th className="font-medium px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {data.map((l) => (
                <ListingReviewRow
                  key={l.id}
                  l={l}
                  canPostLive={hasRole(role, MANAGER_ROLES)}
                  busy={act.isPending}
                  onApprove={() => act.mutate({ kind: 'approve', l })}
                  onPostLive={() => act.mutate({ kind: 'live', l })}
                  onReject={() => setRejecting(l)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rejecting && (
        <RejectListingDialog
          listing={rejecting}
          pending={reject.isPending}
          onClose={() => setRejecting(null)}
          onConfirm={(body) => reject.mutate({ id: rejecting.id, body })}
        />
      )}
    </div>
  );
}
