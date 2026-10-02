'use client';
import { useQuery } from '@tanstack/react-query';
import { fetchOrderCheck, fulfilmentKeys } from '@/lib/fulfilment/api';
import CheckSignals from './CheckSignals';

/** Signals for the whole order, shown in the prescription review (which is also the check, Sprint 35). */
export default function OrderCheckSignals({ orderId }: { orderId: string }) {
  const { data } = useQuery({ queryKey: fulfilmentKeys.orderCheck(orderId), queryFn: () => fetchOrderCheck(orderId) });
  if (!data) return null;
  return (
    <div className="mb-3">
      <p className="text-xs text-gray-700 mb-1">Verifying this prescription also releases Dawabag&apos;s part of the order for packing.</p>
      <CheckSignals signals={data.signals} />
    </div>
  );
}
