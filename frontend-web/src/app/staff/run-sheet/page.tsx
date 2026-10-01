'use client';
import { useQueryClient } from '@tanstack/react-query';
import { riderKeys } from '@/lib/fulfilment/riders';
import PageHeader from '@/components/admin/PageHeader';
import RequireAuth from '@/components/auth/RequireAuth';
import RunSheet from '@/components/staff/delivery/RunSheet';
import { RIDER_ROLES } from '@/lib/fulfilment/roles';

export default function RunSheetPage() {
  const queryClient = useQueryClient();
  return (
    <RequireAuth roles={RIDER_ROLES}>
      <PageHeader
        title="My run sheet"
        subtitle="Parcels out with you: where, to whom and the seal. Hand each one over with the buyer's code."
        onRefresh={() => queryClient.invalidateQueries({ queryKey: riderKeys.myRun })}
      />
      <RunSheet />
    </RequireAuth>
  );
}
