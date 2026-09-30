'use client';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Loader2, Package, IndianRupee, ClipboardCheck, AlertTriangle, Users, RefreshCw } from 'lucide-react';
import api from '@/lib/api';
import { formatPrice, formatDate, ORDER_STATUS_LABELS } from '@/lib/utils';

export default function AdminDashboard() {
  const router = useRouter();

  const { data: stats, isLoading, refetch } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => { const { data } = await api.get('/admin/stats'); return data.data; },
    refetchInterval: 60000,
  });

  const { data: queueData } = useQuery({
    queryKey: ['order-queue'],
    queryFn: async () => { const { data } = await api.get('/orders/queue?limit=10'); return data.data; },
    refetchInterval: 30000,
  });

  const metricCards = [
    { label: "Today's orders", value: stats?.today_orders ?? 0, icon: Package, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: "Today's revenue", value: formatPrice(stats?.today_revenue_paise ?? 0), icon: IndianRupee, color: 'text-brand-600', bg: 'bg-brand-50' },
    { label: 'Pending Rx', value: stats?.pending_rx ?? 0, icon: ClipboardCheck, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Low stock items', value: stats?.low_stock_items ?? 0, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'New users today', value: stats?.new_users_today ?? 0, icon: Users, color: 'text-purple-600', bg: 'bg-purple-50' },
  ];

  const pipeline = stats?.pipeline || {};
  const pipelineStages = [
    { key: 'rx_pending', label: 'Rx pending', color: 'bg-amber-100 text-amber-800' },
    { key: 'rx_verified', label: 'Rx verified', color: 'bg-blue-100 text-blue-800' },
    { key: 'packing', label: 'Packing', color: 'bg-indigo-100 text-indigo-800' },
    { key: 'packed', label: 'Packed', color: 'bg-indigo-100 text-indigo-800' },
    { key: 'dispatched', label: 'Dispatched', color: 'bg-brand-100 text-brand-800' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">D</span>
          </div>
          <span className="text-xl font-bold text-brand-600">dawabag</span>
          <span className="text-sm text-gray-400 hidden md:block">/ Admin</span>
        </div>
        <button onClick={() => refetch()} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <h1 className="text-xl font-semibold mb-6">Overview — {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</h1>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-gray-300" /></div>
        ) : (
          <>
            {/* Metric cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
              {metricCards.map((card) => (
                <div key={card.label} className="card">
                  <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center mb-3`}>
                    <card.icon className={`w-5 h-5 ${card.color}`} />
                  </div>
                  <p className="text-xl font-bold text-gray-900">{card.value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{card.label}</p>
                </div>
              ))}
            </div>

            {/* Pipeline */}
            <div className="card mb-6">
              <h2 className="font-semibold text-sm mb-4">Order pipeline</h2>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {pipelineStages.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => router.push('/admin/orders')}
                    className={`rounded-xl p-4 text-center transition-opacity hover:opacity-80 ${s.color}`}
                  >
                    <p className="text-2xl font-bold">{pipeline[s.key] || 0}</p>
                    <p className="text-xs font-medium mt-0.5">{s.label}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Recent orders */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-sm">Pending queue</h2>
                <button onClick={() => router.push('/admin/orders')}
                  className="text-xs text-brand-600 hover:underline font-medium">View all →</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left text-xs text-gray-400 font-medium pb-2">Order</th>
                      <th className="text-left text-xs text-gray-400 font-medium pb-2">Customer</th>
                      <th className="text-left text-xs text-gray-400 font-medium pb-2">Status</th>
                      <th className="text-left text-xs text-gray-400 font-medium pb-2">Items</th>
                      <th className="text-left text-xs text-gray-400 font-medium pb-2">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(queueData?.orders || []).map((order: any) => {
                      const si = ORDER_STATUS_LABELS[order.status] || { label: order.status, color: 'text-gray-600 bg-gray-100' };
                      return (
                        <tr key={order.id} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                          onClick={() => router.push(`/admin/orders/${order.id}`)}>
                          <td className="py-2.5 font-medium text-brand-600">{order.order_number}</td>
                          <td className="py-2.5">
                            <p className="font-medium">{order.customer_name || '—'}</p>
                            <p className="text-xs text-gray-400">{order.customer_mobile}</p>
                          </td>
                          <td className="py-2.5">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${si.color}`}>{si.label}</span>
                          </td>
                          <td className="py-2.5 text-gray-500">{order.item_count}</td>
                          <td className="py-2.5 text-gray-400 text-xs">{formatDate(order.created_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!queueData?.orders?.length && (
                  <p className="text-center text-gray-400 text-sm py-6">No pending orders</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
