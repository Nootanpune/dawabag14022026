'use client';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchAlert, recallAlertKeys } from '@/lib/recallAlerts/api';
import BackLink from '@/components/admin/BackLink';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import AlertSummaryCard from '@/components/admin/recallAlerts/AlertSummaryCard';
import AlertLinesList from '@/components/admin/recallAlerts/AlertLinesList';

// One regulator alert: recall or clear each match of our batches (C-28)
export default function AdminRecallAlertPage() {
  const { id } = useParams<{ id: string }>();
  const { data: a, isLoading, error, refetch, isFetching } = useQuery({ queryKey: recallAlertKeys.one(id), queryFn: () => fetchAlert(id) });

  return (
    <div>
      <BackLink href="/admin/recall-alerts" label="Recall alerts" />
      <QueryState isLoading={isLoading} error={error} isEmpty={false} emptyText="" />
      {a && (
        <>
          <PageHeader title={`Recall alert ${a.alert_no}`} subtitle={a.reference} onRefresh={() => refetch()} refreshing={isFetching} />
          <AlertSummaryCard alert={a} />
          <AlertLinesList lines={a.lines} />
        </>
      )}
    </div>
  );
}
