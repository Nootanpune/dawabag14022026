'use client';
import { useQueryClient } from '@tanstack/react-query';
import { fulfilmentKeys } from '@/lib/fulfilment/api';
import PageHeader from '@/components/admin/PageHeader';
import FulfilmentTabs from '@/components/staff/fulfilment/FulfilmentTabs';

export default function FulfilmentPage() {
  const queryClient = useQueryClient();
  return (
    <div>
      <PageHeader
        title="Fulfilment"
        subtitle="Dawabag-own orders: pharmacist check of every order, packing, dispatch and delivery"
        onRefresh={() => queryClient.invalidateQueries({ queryKey: fulfilmentKeys.all })}
      />
      <FulfilmentTabs />
    </div>
  );
}
