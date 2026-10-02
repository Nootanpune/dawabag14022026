'use client';
import { useQuery } from '@tanstack/react-query';
import {
  fetchListings,
  fetchMySettlements,
  fetchPartnerMe,
  fetchShipments,
  partnerKeys,
} from '@/lib/partner/api';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import StatTile from '@/components/partner/StatTile';
import PartnerProfileCard from '@/components/partner/PartnerProfileCard';
import YourLicencesSection from '@/components/licences/YourLicencesSection';

export default function PartnerDashboard() {
  const me = useQuery({ queryKey: partnerKeys.me, queryFn: fetchPartnerMe });
  const listings = useQuery({ queryKey: partnerKeys.listings, queryFn: fetchListings });
  const pending = useQuery({ queryKey: partnerKeys.shipments('pending'), queryFn: () => fetchShipments('pending') });
  const settlements = useQuery({ queryKey: partnerKeys.settlements, queryFn: fetchMySettlements });

  const count = (status: string) => listings.data?.filter((l) => l.listing_status === status).length ?? '…';
  const awaitingReview = listings.data?.filter((l) => l.approval_status === 'pending').length ?? '…';
  const unpaid = settlements.data?.filter((s) => s.payment_status !== 'paid').length ?? '…';

  const refresh = () => {
    me.refetch();
    listings.refetch();
    pending.refetch();
    settlements.refetch();
  };

  return (
    <div>
      <PageHeader title="Dashboard" onRefresh={refresh} refreshing={me.isFetching || listings.isFetching} />
      <QueryState isLoading={me.isLoading} error={me.error} isEmpty={false} emptyText="" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatTile label="Live listings" value={count('live')} href="/partner/listings" />
        <StatTile label="Awaiting review" value={awaitingReview} href="/partner/listings" />
        <StatTile label="Shipments to dispatch" value={pending.data?.length ?? '…'} href="/partner/shipments" />
        <StatTile label="Unpaid settlements" value={unpaid} href="/partner/settlements" />
      </div>
      {me.data && <PartnerProfileCard me={me.data} />}
      {me.data && <div className="mt-4"><YourLicencesSection holder="partner" party="partner" suggested={['dl20', 'dl21', 'dl20b', 'dl21b']} /></div>}
    </div>
  );
}
