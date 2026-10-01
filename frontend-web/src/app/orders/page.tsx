'use client';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Loader2, Package, RefreshCw, ChevronRight } from 'lucide-react';
import api from '@/lib/api';
import { formatPrice, ORDER_STATUS_LABELS } from '@/lib/utils';
import Header from '@/components/layout/Header';
import { formatDateIST } from '@/lib/dates';
import EmptyState from '@/components/ui/EmptyState';

export default function OrdersPage() {
  const router = useRouter();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['my-orders'],
    queryFn: async () => {
      const { data } = await api.get('/orders/my?limit=20');
      return data.data;
    },
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold">My orders</h1>
          <button onClick={() => refetch()} aria-label="Refresh orders" className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
          </div>
        ) : !data?.orders?.length ? (
          <EmptyState
            icon={Package}
            title="No orders yet"
            hint="When you order medicines, you can track them and download invoices here."
            action={{ label: 'Browse medicines', href: '/' }}
          />
        ) : (
          <div className="space-y-3">
            {data.orders.map((order: any) => {
              const statusInfo = ORDER_STATUS_LABELS[order.status] || { label: order.status, color: 'text-gray-600 bg-gray-100' };
              return (
                <div
                  key={order.id}
                  onClick={() => router.push(`/orders/${order.id}`)}
                  className="card hover:shadow-md transition-shadow cursor-pointer"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-sm">{order.order_number}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDateIST(order.created_at)}</p>
                    </div>
                    <div className="text-right flex items-center gap-2">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 text-sm text-gray-600">
                    <span>{order.item_count} item{Number(order.item_count) > 1 ? 's' : ''}</span>
                    <span className="font-semibold text-gray-800">{formatPrice(order.total_paise)}</span>
                  </div>
                  {order.awb_number && (
                    <p className="text-xs text-brand-600 mt-1">
                      Tracking: {order.courier_partner} · {order.awb_number}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
