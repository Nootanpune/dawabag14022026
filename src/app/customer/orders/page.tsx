// =====================================================
// DAWABAG - Customer Orders Page
// =====================================================

"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import Button from '@/components/ui/Button';
import { Order, OrderStatus } from '@/types';
import { formatDate } from '@/lib/utils';

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    // Check auth
    const savedUser = localStorage.getItem('dawabag_user');
    if (savedUser) {
      setIsLoggedIn(true);
      // Load orders
      const savedOrders = localStorage.getItem('dawabag_orders');
      if (savedOrders) {
        setOrders(JSON.parse(savedOrders));
      }
    }
  }, []);

  const getStatusColor = (status: OrderStatus) => {
    const colors: Record<OrderStatus, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      payment_verified: 'bg-blue-100 text-blue-800',
      prescription_pending: 'bg-orange-100 text-orange-800',
      prescription_verified: 'bg-green-100 text-green-800',
      prescription_rejected: 'bg-red-100 text-red-800',
      pending_packing: 'bg-blue-100 text-blue-800',
      packed: 'bg-indigo-100 text-indigo-800',
      dispatched: 'bg-purple-100 text-purple-800',
      out_for_delivery: 'bg-teal-100 text-teal-800',
      delivered: 'bg-green-100 text-green-800',
      cancelled: 'bg-gray-100 text-gray-800',
      refunded: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusLabel = (status: OrderStatus) => {
    const labels: Record<OrderStatus, string> = {
      pending: 'Pending',
      payment_verified: 'Payment Verified',
      prescription_pending: 'Prescription Pending',
      prescription_verified: 'Prescription Verified',
      prescription_rejected: 'Prescription Rejected',
      pending_packing: 'Pending Packing',
      packed: 'Packed',
      dispatched: 'Dispatched',
      out_for_delivery: 'Out for Delivery',
      delivered: 'Delivered',
      cancelled: 'Cancelled',
      refunded: 'Refunded',
    };
    return labels[status] || status;
  };

  const getTimelineSteps = (status: OrderStatus) => {
    const allSteps = [
      { key: 'pending', label: 'Order Placed' },
      { key: 'payment_verified', label: 'Payment Verified' },
      { key: 'prescription_verified', label: 'Prescription Verified' },
      { key: 'pending_packing', label: 'Pending Packing' },
      { key: 'packed', label: 'Packed' },
      { key: 'dispatched', label: 'Dispatched' },
      { key: 'out_for_delivery', label: 'Out for Delivery' },
      { key: 'delivered', label: 'Delivered' },
    ];

    const statusIndex = allSteps.findIndex(s => s.key === status);
    
    return allSteps.map((step, index) => ({
      ...step,
      completed: index <= statusIndex,
      current: index === statusIndex,
    }));
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <h2 className="text-xl font-medium text-gray-900 mb-4">Please login to view your orders</h2>
          <Link href="/customer/login?redirect=/customer/orders">
            <Button>Login</Button>
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-8">My Orders</h1>

        {orders.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-8 text-center">
            <svg className="mx-auto h-16 w-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <h2 className="mt-4 text-xl font-medium text-gray-900">No orders yet</h2>
            <p className="mt-2 text-gray-500">Looks like you haven't placed any orders yet.</p>
            <Link href="/">
              <Button className="mt-6">Start Shopping</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Orders List */}
            <div className="lg:col-span-2 space-y-4">
              {orders.map((order) => (
                <div
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  className={`bg-white rounded-lg shadow-sm p-6 cursor-pointer transition-all ${
                    selectedOrder?.id === order.id ? 'ring-2 ring-teal-500' : 'hover:shadow-md'
                  }`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-sm text-gray-500">Order Number</p>
                      <p className="font-semibold text-gray-900">{order.orderNumber}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(order.orderStatus)}`}>
                      {getStatusLabel(order.orderStatus)}
                    </span>
                  </div>

                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-sm text-gray-500">{order.items.length} item(s)</p>
                      <p className="font-semibold text-gray-900">₹{order.total.toFixed(2)}</p>
                    </div>
                    <p className="text-sm text-gray-500">{formatDate(order.createdAt)}</p>
                  </div>

                  {/* Shipping Address */}
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-xs text-gray-500">Delivery Address</p>
                    <p className="text-sm text-gray-700">
                      {order.shippingAddress.name}, {order.shippingAddress.addressLine1}, {order.shippingAddress.city} - {order.shippingAddress.pincode}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Order Details */}
            <div className="lg:col-span-1">
              {selectedOrder ? (
                <div className="bg-white rounded-lg shadow-sm p-6 sticky top-24">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Order Details</h2>
                  
                  <div className="mb-6">
                    <p className="text-sm text-gray-500">Order Number</p>
                    <p className="font-medium">{selectedOrder.orderNumber}</p>
                  </div>

                  {/* Timeline */}
                  <div className="mb-6">
                    <h3 className="text-sm font-medium text-gray-700 mb-3">Order Status</h3>
                    <div className="space-y-3">
                      {getTimelineSteps(selectedOrder.orderStatus).map((step, index) => (
                        <div key={step.key} className="flex items-center">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                            step.completed ? 'bg-teal-600 text-white' : 'bg-gray-200 text-gray-400'
                          }`}>
                            {step.completed ? (
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            ) : (
                              <span className="text-xs">{index + 1}</span>
                            )}
                          </div>
                          <span className={`ml-3 text-sm ${step.completed ? 'text-gray-900' : 'text-gray-400'}`}>
                            {step.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Order Items */}
                  <div className="mb-6">
                    <h3 className="text-sm font-medium text-gray-700 mb-3">Items</h3>
                    <div className="space-y-3">
                      {selectedOrder.items.map((item, index) => (
                        <div key={index} className="flex justify-between text-sm">
                          <div>
                            <p className="font-medium">{item.medicineName}</p>
                            <p className="text-gray-500">{item.quantity} x ₹{item.offerPrice}</p>
                          </div>
                          <p className="font-medium">₹{item.total}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Price Breakdown */}
                  <div className="border-t pt-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Subtotal</span>
                      <span>₹{selectedOrder.subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Discount</span>
                      <span className="text-green-600">-₹{selectedOrder.discount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Shipping</span>
                      <span>{selectedOrder.shippingCharges === 0 ? 'Free' : `₹${selectedOrder.shippingCharges}`}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">GST</span>
                      <span>₹{selectedOrder.gstAmount?.toFixed(2) || '0.00'}</span>
                    </div>
                    <div className="flex justify-between font-semibold pt-2 border-t">
                      <span>Total</span>
                      <span>₹{selectedOrder.total.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-6 space-y-2">
                    {selectedOrder.orderStatus === 'delivered' && (
                      <Button variant="outline" className="w-full">Download Invoice</Button>
                    )}
                    {selectedOrder.orderStatus === 'pending' && (
                      <Button variant="danger" className="w-full">Cancel Order</Button>
                    )}
                    {selectedOrder.orderStatus === 'delivered' && (
                      <Button variant="outline" className="w-full">Order Again</Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow-sm p-6 text-center text-gray-500">
                  Click on an order to view details
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
