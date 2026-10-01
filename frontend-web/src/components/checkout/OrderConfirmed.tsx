'use client';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import SoldBySection, { type OrderShipment } from '@/components/orders/SoldBySection';
import { formatPrice } from '@/lib/utils';

interface Props { orderNumber: string; totalPaise: number; shipments?: OrderShipment[] }

export default function OrderConfirmed({ orderNumber, totalPaise, shipments }: Props) {
  const router = useRouter();
  return (
    <div className="card text-center py-10">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 className="w-8 h-8 text-green-700" />
      </div>
      <h2 className="text-2xl font-bold text-gray-800 mb-2">Order confirmed!</h2>
      <p className="text-gray-500 text-sm mb-1">
        Order ID: <strong>{orderNumber}</strong>
      </p>
      {/* Seller amounts below are each invoice's items and GST; the total paid also has delivery */}
      <p className="text-gray-700 text-sm mb-1">
        Total paid: <strong>{formatPrice(totalPaise)}</strong> <span className="text-gray-500">incl. delivery and GST</span>
      </p>
      <p className="text-gray-400 text-xs mb-6">You&apos;ll receive SMS and email updates at every step.</p>
      <SoldBySection shipments={shipments} className="text-left max-w-sm mx-auto mb-6 border border-gray-100 rounded-lg p-3" />
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button onClick={() => router.push('/orders')} className="btn-outline">
          Track my order
        </button>
        <button onClick={() => router.push('/')} className="btn-primary">
          Continue shopping
        </button>
      </div>
    </div>
  );
}
