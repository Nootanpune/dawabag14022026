// =====================================================
// DAWABAG - Checkout Success Page
// =====================================================

"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import Button from '@/components/ui/Button';

export default function CheckoutSuccessPage() {
  const searchParams = useSearchParams();
  const orderNumber = searchParams.get('order') || '';
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="bg-white rounded-lg shadow-sm p-8 text-center">
          {/* Success Icon */}
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">Order Placed Successfully!</h1>
          <p className="text-gray-600 mb-4">
            Thank you for your order. Your order has been placed and is being processed.
          </p>

          {orderNumber && (
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <p className="text-sm text-gray-500">Order Number</p>
              <p className="text-xl font-bold text-gray-900">{orderNumber}</p>
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-center justify-center space-x-2 text-gray-600">
              <svg className="h-5 w-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span className="text-sm">Order confirmation sent to your email</span>
            </div>
            
            <div className="flex items-center justify-center space-x-2 text-gray-600">
              <svg className="h-5 w-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              <span className="text-sm">SMS notification will be sent for updates</span>
            </div>
          </div>

          {/* Next Steps */}
          <div className="mt-8 bg-teal-50 rounded-lg p-6">
            <h3 className="font-semibold text-teal-900 mb-3">What happens next?</h3>
            <ul className="text-sm text-teal-800 space-y-2">
              <li className="flex items-center">
                <span className="w-6 h-6 bg-teal-600 text-white rounded-full flex items-center justify-center mr-2 text-xs">1</span>
                Order confirmation & prescription verification
              </li>
              <li className="flex items-center">
                <span className="w-6 h-6 bg-teal-600 text-white rounded-full flex items-center justify-center mr-2 text-xs">2</span>
                Pharmacist verification of your prescription
              </li>
              <li className="flex items-center">
                <span className="w-6 h-6 bg-teal-600 text-white rounded-full flex items-center justify-center mr-2 text-xs">3</span>
                Order packing and dispatch
              </li>
              <li className="flex items-center">
                <span className="w-6 h-6 bg-teal-600 text-white rounded-full flex items-center justify-center mr-2 text-xs">4</span>
                Delivery to your address
              </li>
            </ul>
          </div>

          {/* Actions */}
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/customer/orders">
              <Button>Track Order</Button>
            </Link>
            <Link href="/">
              <Button variant="outline">Continue Shopping</Button>
            </Link>
          </div>

          <p className="mt-4 text-sm text-gray-500">
            Redirecting to home in {countdown} seconds...
          </p>
        </div>
      </div>

      <Footer />
    </div>
  );
}
