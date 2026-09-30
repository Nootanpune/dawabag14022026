'use client';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';

export default function OrderConfirmed({ orderNumber }: { orderNumber: string }) {
  const router = useRouter();
  return (
    <div className="card text-center py-10">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 className="w-8 h-8 text-green-600" />
      </div>
      <h2 className="text-2xl font-bold text-gray-800 mb-2">Order confirmed!</h2>
      <p className="text-gray-500 text-sm mb-1">
        Order ID: <strong>{orderNumber}</strong>
      </p>
      <p className="text-gray-400 text-xs mb-8">You&apos;ll receive SMS and email updates at every step.</p>
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
