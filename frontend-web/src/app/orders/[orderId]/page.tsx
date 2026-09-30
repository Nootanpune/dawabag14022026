'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, ArrowLeft, ExternalLink, RefreshCw } from 'lucide-react';
import api from '@/lib/api';
import { formatPrice, formatDate, ORDER_STATUS_LABELS } from '@/lib/utils';
import Header from '@/components/layout/Header';
import SoldBySection from '@/components/orders/SoldBySection';
import RefillSetupButton from '@/components/orders/RefillSetupButton';

const TIMELINE_STEPS = [
  { status: 'pending_payment', label: 'Order placed' },
  { status: 'rx_pending', label: 'Prescription submitted' },
  { status: 'rx_verified', label: 'Prescription verified' },
  { status: 'packed', label: 'Order packed' },
  { status: 'dispatched', label: 'Dispatched' },
  { status: 'delivered', label: 'Delivered' },
];

const STATUS_ORDER = ['pending_payment','rx_pending','rx_verified','packing','packed','dispatched','delivered'];

export default function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const router = useRouter();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['order', orderId],
    queryFn: async () => {
      const { data } = await api.get(`/orders/${orderId}`);
      return data.data;
    },
    refetchInterval: 30000, // Poll every 30s for status updates
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-gray-300" /></div>
      </div>
    );
  }

  const order = data;
  const statusInfo = ORDER_STATUS_LABELS[order?.status] || { label: order?.status, color: 'text-gray-600 bg-gray-100' };
  const currentStatusIdx = STATUS_ORDER.indexOf(order?.status);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">{order?.order_number}</h1>
            <p className="text-xs text-gray-400">
              {formatDate(order?.created_at)}
              {order?.invoice_number ? ` · Invoice ${order.invoice_number}` : ''}
            </p>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
          <button onClick={() => refetch()} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Timeline */}
        <div className="card mb-4">
          <h3 className="font-semibold text-sm mb-4">Order timeline</h3>
          <div className="space-y-0">
            {TIMELINE_STEPS
              .filter((s) => !['rx_pending','rx_verified'].includes(s.status) || order?.status !== 'pending_payment')
              .map((step, i, arr) => {
              const stepIdx = STATUS_ORDER.indexOf(step.status);
              const done = currentStatusIdx >= stepIdx && order?.status !== 'rx_rejected';
              const active = STATUS_ORDER[currentStatusIdx] === step.status;
              return (
                <div key={step.status} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0 mt-1
                      ${done ? 'bg-brand-600 border-brand-600' :
                        active ? 'bg-brand-200 border-brand-400' :
                        'bg-white border-gray-300'}`} />
                    {i < arr.length - 1 && (
                      <div className={`w-0.5 flex-1 min-h-[1.5rem] ${done ? 'bg-brand-200' : 'bg-gray-100'}`} />
                    )}
                  </div>
                  <div className="pb-4">
                    <p className={`text-sm font-medium ${done ? 'text-gray-800' : 'text-gray-400'}`}>
                      {step.label}
                    </p>
                    {step.status === 'rx_pending' && order?.status === 'rx_pending' && (
                      <p className="text-xs text-amber-600 mt-0.5">
                        Our pharmacist will call you to verify your prescription
                      </p>
                    )}
                    {step.status === 'dispatched' && order?.awb_number && (
                      <div className="mt-1">
                        <p className="text-xs text-gray-500">{order.courier_partner} · {order.awb_number}</p>
                        {order.tracking_url && (
                          <a href={order.tracking_url} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-brand-600 hover:underline flex items-center gap-1 mt-0.5">
                            Track shipment <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {order?.status === 'rx_rejected' && (
              <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                Prescription rejected. Your order has been cancelled and refund initiated.
              </div>
            )}
          </div>
        </div>

        {/* Items */}
        <div className="card mb-4">
          <h3 className="font-semibold text-sm mb-3">Items ordered</h3>
          <div className="space-y-3">
            {order?.items?.map((item: any) => (
              <div key={item.id} className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
                  <span className="text-lg">💊</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium line-clamp-1">{item.product_name}</p>
                  <p className="text-xs text-gray-400">{item.sku} · Qty: {item.quantity}</p>
                </div>
                <p className="text-sm font-semibold">{formatPrice(item.line_total_paise)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Seller of record per shipment — only when the API returns shipments */}
        <SoldBySection shipments={order?.shipments} />

        {order?.status === 'delivered' && <RefillSetupButton orderId={order.id} />}

        {/* Complaint about this order (C-36) */}
        {order?.id && (
          <p className="text-xs text-gray-500 mb-4">
            Problem with this order?{' '}
            <Link href={`/account/complaints/new?order=${order.id}`} className="text-brand-600 hover:underline">
              Raise a complaint
            </Link>
          </p>
        )}

        {/* Bill */}
        <div className="card mb-4">
          <h3 className="font-semibold text-sm mb-3">Bill summary</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span><span>{formatPrice(order?.subtotal_paise)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Shipping</span><span>{formatPrice(order?.shipping_paise)}</span>
            </div>
            {order?.discount_paise > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Discount</span><span>–{formatPrice(order?.discount_paise)}</span>
              </div>
            )}
            <div className="border-t border-gray-100 pt-2 flex justify-between font-semibold">
              <span>Total paid</span>
              <span className="text-brand-600">{formatPrice(order?.total_paise)}</span>
            </div>
            {order?.payment_method && (
              <p className="text-xs text-gray-400">Paid via {order.payment_method} · {order.gateway_payment_id}</p>
            )}
          </div>
        </div>

        {/* Delivery address */}
        {order?.address_line1 && (
          <div className="card">
            <h3 className="font-semibold text-sm mb-2">Delivery address</h3>
            <p className="text-sm font-medium">{order.delivery_name}</p>
            <p className="text-sm text-gray-500">
              {order.address_line1}
              {order.address_line2 ? `, ${order.address_line2}` : ''}, {order.city} — {order.pincode}
            </p>
            <p className="text-sm text-gray-400">{order.delivery_mobile}</p>
          </div>
        )}
      </div>
    </div>
  );
}
