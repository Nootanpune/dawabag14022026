'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { fetchOrder, orderKeys } from '@/lib/orders/api';
import { orderStatusInfo } from '@/lib/orders/statusLabel';
import Header from '@/components/layout/Header';
import QueryState from '@/components/admin/QueryState';
import OrderTimeline from '@/components/orders/OrderTimeline';
import OrderItemsCard from '@/components/orders/OrderItemsCard';
import OrderShipmentsCard from '@/components/orders/OrderShipmentsCard';
import CancelOrderCard from '@/components/orders/CancelOrderCard';
import EditOrderCard from '@/components/orders/edit/EditOrderCard';
import OrderEditsCard from '@/components/orders/edit/OrderEditsCard';
import ExtraPaymentCard from '@/components/orders/edit/ExtraPaymentCard';
import WrittenOrdersCard from '@/components/orders/WrittenOrdersCard';
import RefundsCard from '@/components/orders/RefundsCard';
import PaymentHoldCard from '@/components/orders/PaymentHoldCard';
import OrderBillCard from '@/components/orders/OrderBillCard';
import DeliveryAddressCard from '@/components/orders/DeliveryAddressCard';
import RefillSetupButton from '@/components/orders/RefillSetupButton';
import RefusedOrderCard from '@/components/orders/RefusedOrderCard';
import { formatDateIST } from '@/lib/dates';

export default function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { data: order, isLoading, error, refetch } = useQuery({
    queryKey: orderKeys.one(orderId),
    queryFn: () => fetchOrder(orderId),
    refetchInterval: 30000, // status, delivery code and refunds come from the server
  });

  const statusInfo = order ? orderStatusInfo(order) : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6">
        <QueryState isLoading={isLoading} error={error} isEmpty={false} emptyText="" />
        {order && statusInfo && (
          <>
            <div className="flex items-center gap-3 mb-6">
              {/* Sprint 43 (QA): one Back only — the header's (a second arrow here was a duplicate) */}
              <div className="flex-1">
                <h1 className="text-lg font-semibold">{order.order_number}</h1>
                <p className="text-xs text-gray-400">
                  {formatDateIST(order.created_at)}
                  {order.invoice_number ? ` · Invoice ${order.invoice_number}` : ''}
                </p>
                {order.invoice_note && <p className="text-xs text-gray-500" data-testid="invoice-note">{order.invoice_note}</p>}
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
              <button onClick={() => refetch()} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400" aria-label="Refresh">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            <RefusedOrderCard order={order} />
            <OrderTimeline order={order} />
            <OrderShipmentsCard order={order} />
            <OrderItemsCard order={order} />
            <ExtraPaymentCard order={order} />
            <EditOrderCard order={order} />
            <OrderEditsCard order={order} />
            <WrittenOrdersCard order={order} />
            {order.can_cancel && <CancelOrderCard orderId={order.id} />}
            <PaymentHoldCard order={order} />
            <RefundsCard order={order} />
            {order.status === 'delivered' && <RefillSetupButton orderId={order.id} />}

            {/* Complaint about this order (C-36) */}
            <p className="text-xs text-gray-500 mb-4">
              Problem with this order?{' '}
              <Link href={`/account/complaints/new?order=${order.id}`} className="text-brand-600 hover:underline">
                Raise a complaint
              </Link>
            </p>

            <OrderBillCard order={order} />
            <DeliveryAddressCard order={order} />
          </>
        )}
      </div>
    </div>
  );
}
