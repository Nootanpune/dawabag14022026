'use client';
import { useQuery } from '@tanstack/react-query';
import { fetchReturn, returnKeys } from '@/lib/returns/api';
import BackLink from '@/components/admin/BackLink';
import QueryState from '@/components/admin/QueryState';
import ReturnDetailView from '@/components/returns/ReturnDetailView';
import ReturnStaffActions from './ReturnStaffActions';

export default function ReturnStaffDetail({ id, basePath }: { id: string; basePath: string }) {
  const { data, isLoading, error } = useQuery({ queryKey: returnKeys.one(id), queryFn: () => fetchReturn(id) });
  return (
    <div>
      <BackLink href={basePath} label="Returns" />
      <QueryState isLoading={isLoading} error={error} isEmpty={false} emptyText="" />
      {data && <ReturnDetailView r={data} actions={<ReturnStaffActions r={data} />} />}
    </div>
  );
}
