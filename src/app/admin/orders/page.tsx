// =====================================================
// DAWABAG - Admin Orders Management Page
// =====================================================

"use client";

import { useState, useEffect } from 'react';
import Header from '@/components/layout/Header';
import Button from '@/components/ui/Button';
import { Order, OrderStatus, PaymentStatus, PrescriptionStatus } from '@/types';
import { formatDate } from '@/lib/utils';

const mockOrders: Order[] = [
  {
    id: 'order_001',
    orderNumber: 'DWB-20260214-ABC1',
    customerId: 'cust_001',
    items: [
      { id: '1', medicineId: 'med_001', medicineName: 'Dolo 650', genericName: 'Paracetamol', brandName: 'Dolo', strength: '650mg', dosageForm: 'tablet', packSize: 15, quantity: 2, mrp: 35, offerPrice: 28, discount: 20, total: 56 },
    ],
    shippingAddress: { id: 'addr_001', type: 'shipping', name: 'John Doe', mobile: '9876543210', addressLine1: '123 Main St', city: 'Mumbai', state: 'Maharashtra', pincode: '400001', isDefault: true },
    billingAddress: { id: 'addr_001', type: 'billing', name: 'John Doe', mobile: '9876543210', addressLine1: '123 Main St', city: 'Mumbai', state: 'Maharashtra', pincode: '400001', isDefault: true },
    subtotal: 56,
    discount: 0,
    couponDiscount: 0,
    referralDiscount: 0,
    shippingCharges: 49,
    gstAmount: 10.08,
    total: 115.08,
    paymentMethod: 'upi',
    paymentStatus: 'completed',
    orderStatus: 'pending',
    prescriptionStatus: 'pending',
    isRefillOrder: false,
    pincode: '400001',
    createdAt: '2026-02-14T10:00:00Z',
    updatedAt: '2026-02-14T10:00:00Z',
  },
  {
    id: 'order_002',
    orderNumber: 'DWB-20260214-ABC2',
    customerId: 'cust_002',
    items: [
      { id: '2', medicineId: 'med_002', medicineName: 'Azithromycin 500mg', genericName: 'Azithromycin', brandName: 'Azithral', strength: '500mg', dosageForm: 'tablet', packSize: 5, quantity: 1, mrp: 120, offerPrice: 95, discount: 21, total: 95 },
    ],
    shippingAddress: { id: 'addr_002', type: 'shipping', name: 'Jane Smith', mobile: '9876543211', addressLine1: '456 Oak Ave', city: 'Pune', state: 'Maharashtra', pincode: '411001', isDefault: true },
    billingAddress: { id: 'addr_002', type: 'billing', name: 'Jane Smith', mobile: '9876543211', addressLine1: '456 Oak Ave', city: 'Pune', state: 'Maharashtra', pincode: '411001', isDefault: true },
    subtotal: 95,
    discount: 0,
    couponDiscount: 0,
    referralDiscount: 0,
    shippingCharges: 49,
    gstAmount: 17.1,
    total: 161.1,
    paymentMethod: 'card',
    paymentStatus: 'completed',
    orderStatus: 'prescription_verified',
    prescriptionStatus: 'verified',
    isRefillOrder: false,
    pincode: '411001',
    createdAt: '2026-02-14T11:30:00Z',
    updatedAt: '2026-02-14T12:00:00Z',
  },
  {
    id: 'order_003',
    orderNumber: 'DWB-20260213-ABC3',
    customerId: 'cust_003',
    items: [
      { id: '3', medicineId: 'med_003', medicineName: 'Metformin 500mg', genericName: 'Metformin', brandName: 'Glycomet', strength: '500mg', dosageForm: 'tablet', packSize: 30, quantity: 1, mrp: 75, offerPrice: 58, discount: 23, total: 58 },
    ],
    shippingAddress: { id: 'addr_003', type: 'shipping', name: 'Raj Patel', mobile: '9876543212', addressLine1: '789 Green St', city: 'Delhi', state: 'Delhi', pincode: '110001', isDefault: true },
    billingAddress: { id: 'addr_003', type: 'billing', name: 'Raj Patel', mobile: '9876543212', addressLine1: '789 Green St', city: 'Delhi', state: 'Delhi', pincode: '110001', isDefault: true },
    subtotal: 58,
    discount: 0,
    couponDiscount: 0,
    referralDiscount: 0,
    shippingCharges: 0,
    gstAmount: 10.44,
    total: 68.44,
    paymentMethod: 'netbanking',
    paymentStatus: 'completed',
    orderStatus: 'packed',
    prescriptionStatus: 'verified',
    isRefillOrder: false,
    pincode: '110001',
    createdAt: '2026-02-13T09:15:00Z',
    updatedAt: '2026-02-14T14:00:00Z',
  },
  {
    id: 'order_004',
    orderNumber: 'DWB-20260213-ABC4',
    customerId: 'cust_004',
    items: [
      { id: '4', medicineId: 'med_004', medicineName: 'Cetirizine 10mg', genericName: 'Cetirizine', brandName: 'Cetzine', strength: '10mg', dosageForm: 'tablet', packSize: 10, quantity: 3, mrp: 65, offerPrice: 45, discount: 31, total: 135 },
    ],
    shippingAddress: { id: 'addr_004', type: 'shipping', name: 'Anita Sharma', mobile: '9876543213', addressLine1: '321 Blue Rd', city: 'Bangalore', state: 'Karnataka', pincode: '560001', isDefault: true },
    billingAddress: { id: 'addr_004', type: 'billing', name: 'Anita Sharma', mobile: '9876543213', addressLine1: '321 Blue Rd', city: 'Bangalore', state: 'Karnataka', pincode: '560001', isDefault: true },
    subtotal: 135,
    discount: 0,
    couponDiscount: 0,
    referralDiscount: 0,
    shippingCharges: 0,
    gstAmount: 24.3,
    total: 159.3,
    paymentMethod: 'wallet',
    paymentStatus: 'completed',
    orderStatus: 'dispatched',
    isRefillOrder: false,
    pincode: '560001',
    createdAt: '2026-02-13T15:45:00Z',
    updatedAt: '2026-02-14T16:30:00Z',
  },
  {
    id: 'order_005',
    orderNumber: 'DWB-20260212-ABC5',
    customerId: 'cust_005',
    items: [
      { id: '5', medicineId: 'med_005', medicineName: 'Omeprazole 20mg', genericName: 'Omeprazole', brandName: 'Omez', strength: '20mg', dosageForm: 'capsule', packSize: 15, quantity: 2, mrp: 85, offerPrice: 62, discount: 27, total: 124 },
    ],
    shippingAddress: { id: 'addr_005', type: 'shipping', name: 'Mike Johnson', mobile: '9876543214', addressLine1: '654 Red Ln', city: 'Chennai', state: 'Tamil Nadu', pincode: '600001', isDefault: true },
    billingAddress: { id: 'addr_005', type: 'billing', name: 'Mike Johnson', mobile: '9876543214', addressLine1: '654 Red Ln', city: 'Chennai', state: 'Tamil Nadu', pincode: '600001', isDefault: true },
    subtotal: 124,
    discount: 0,
    couponDiscount: 0,
    referralDiscount: 0,
    shippingCharges: 49,
    gstAmount: 22.32,
    total: 195.32,
    paymentMethod: 'card',
    paymentStatus: 'completed',
    orderStatus: 'delivered',
    isRefillOrder: false,
    pincode: '600001',
    createdAt: '2026-02-12T11:00:00Z',
    updatedAt: '2026-02-14T10:00:00Z',
  },
];

const statusTabs = [
  { id: 'all', label: 'All Orders', count: 5 },
  { id: 'pending', label: 'Pending', count: 1 },
  { id: 'prescription_pending', label: 'Prescription Pending', count: 1 },
  { id: 'prescription_verified', label: 'Ready to Pack', count: 1 },
  { id: 'packed', label: 'Packed', count: 1 },
  { id: 'dispatched', label: 'Dispatched', count: 1 },
  { id: 'delivered', label: 'Delivered', count: 1 },
];

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>(mockOrders);
  const [activeTab, setActiveTab] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showPrescription, setShowPrescription] = useState(false);

  const filteredOrders = activeTab === 'all' 
    ? orders 
    : orders.filter(order => order.orderStatus === activeTab);

  const updateOrderStatus = (orderId: string, newStatus: OrderStatus) => {
    setOrders(orders.map(order => 
      order.id === orderId 
        ? { ...order, orderStatus: newStatus, updatedAt: new Date().toISOString() }
        : order
    ));
    if (selectedOrder?.id === orderId) {
      setSelectedOrder({ ...selectedOrder, orderStatus: newStatus });
    }
  };

  const getStatusColor = (status: OrderStatus) => {
    const colors: Record<string, string> = {
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
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getNextActions = (status: OrderStatus) => {
    const actions: Record<string, { label: string; newStatus: OrderStatus }[]> = {
      pending: [
        { label: 'Verify Payment', newStatus: 'payment_verified' as OrderStatus },
        { label: 'Cancel Order', newStatus: 'cancelled' as OrderStatus },
      ],
      prescription_pending: [
        { label: 'Verify Prescription', newStatus: 'prescription_verified' as OrderStatus },
        { label: 'Reject Prescription', newStatus: 'prescription_rejected' as OrderStatus },
      ],
      prescription_verified: [
        { label: 'Mark as Packed', newStatus: 'packed' as OrderStatus },
      ],
      packed: [
        { label: 'Mark as Dispatched', newStatus: 'dispatched' as OrderStatus },
      ],
      dispatched: [
        { label: 'Mark as Delivered', newStatus: 'delivered' as OrderStatus },
      ],
    };
    return actions[status] || [];
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Simple Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <a href="/admin/dashboard" className="text-xl font-bold text-teal-600">Dawabag</a>
              <span className="ml-2 text-sm text-gray-500">Admin</span>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">Welcome, Admin</span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-8">Order Management</h1>

        {/* Status Tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          {statusTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium ${
                activeTab === tab.id
                  ? 'bg-teal-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.label}
              <span className="ml-2 bg-gray-200 px-2 py-0.5 rounded-full text-xs">
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Orders List */}
          <div className="lg:col-span-2 space-y-4">
            {filteredOrders.map((order) => (
              <div
                key={order.id}
                onClick={() => setSelectedOrder(order)}
                className={`bg-white rounded-lg shadow-sm p-4 cursor-pointer transition-all ${
                  selectedOrder?.id === order.id ? 'ring-2 ring-teal-500' : 'hover:shadow-md'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-gray-900">{order.orderNumber}</p>
                    <p className="text-sm text-gray-500">{order.shippingAddress.name} - {order.shippingAddress.mobile}</p>
                    <p className="text-sm text-gray-500">{order.items.length} item(s) - {order.items[0]?.medicineName}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(order.orderStatus)}`}>
                    {order.orderStatus.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="mt-2 flex justify-between items-center">
                  <p className="text-sm text-gray-500">{formatDate(order.createdAt)}</p>
                  <p className="font-semibold">₹{order.total.toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Order Details */}
          <div className="lg:col-span-1">
            {selectedOrder ? (
              <div className="bg-white rounded-lg shadow-sm p-6 sticky top-24">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Order Details</h2>
                
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-500">Order Number</p>
                    <p className="font-medium">{selectedOrder.orderNumber}</p>
                  </div>

                  <div>
                    <p className="text-sm text-gray-500">Customer</p>
                    <p className="font-medium">{selectedOrder.shippingAddress.name}</p>
                    <p className="text-sm text-gray-600">{selectedOrder.shippingAddress.mobile}</p>
                  </div>

                  <div>
                    <p className="text-sm text-gray-500">Delivery Address</p>
                    <p className="text-sm">
                      {selectedOrder.shippingAddress.addressLine1}, {selectedOrder.shippingAddress.city} - {selectedOrder.shippingAddress.pincode}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-gray-500">Items</p>
                    {selectedOrder.items.map((item, idx) => (
                      <p key={idx} className="text-sm">
                        {item.medicineName} x {item.quantity} = ₹{item.total}
                      </p>
                    ))}
                  </div>

                  <div>
                    <p className="text-sm text-gray-500">Payment</p>
                    <p className="text-sm">{selectedOrder.paymentMethod} - {selectedOrder.paymentStatus}</p>
                  </div>

                  {selectedOrder.prescriptionStatus && (
                    <div>
                      <p className="text-sm text-gray-500">Prescription Status</p>
                      <span className={`px-2 py-1 rounded text-xs ${
                        selectedOrder.prescriptionStatus === 'verified' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'
                      }`}>
                        {selectedOrder.prescriptionStatus}
                      </span>
                    </div>
                  )}

                  {selectedOrder.prescriptionStatus === 'pending' && (
                    <Button
                      onClick={() => setShowPrescription(true)}
                      className="w-full"
                    >
                      View Prescription
                    </Button>
                  )}

                  {/* Actions */}
                  <div className="border-t pt-4 mt-4">
                    <p className="text-sm text-gray-500 mb-3">Actions</p>
                    <div className="space-y-2">
                      {getNextActions(selectedOrder.orderStatus).map((action) => (
                        <Button
                          key={action.newStatus}
                          variant={action.newStatus === 'cancelled' ? 'danger' : 'primary'}
                          onClick={() => updateOrderStatus(selectedOrder.id, action.newStatus)}
                          className="w-full"
                          size="sm"
                        >
                          {action.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm p-6 text-center text-gray-500">
                Select an order to view details
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
