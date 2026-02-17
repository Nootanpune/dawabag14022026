// =====================================================
// DAWABAG - Admin Dashboard
// Addressing URS Backend Gaps
// =====================================================

"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  Order, 
  Medicine, 
  Vendor, 
  InventoryAlert,
  AdminStaff,
  OrderStatus,
  PaymentStatus,
  PaymentMethod,
  PrescriptionStatus,
  StockAlertLevel,
  UserRole,
  SalesReport,
  StockReport,
  GSTRReport,
  VerificationStatus
} from '@/types';

// Sample data
const sampleOrders: Order[] = [
  {
    id: 'ord_001',
    orderNumber: 'DWB-20260214-001',
    customerId: 'cust_001',
    patientId: 'pat_001',
    items: [],
    shippingAddress: {
      id: 'addr_001',
      type: 'shipping',
      name: 'John Doe',
      mobile: '9876543210',
      addressLine1: '123 Main St',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      isDefault: true,
    },
    billingAddress: {
      id: 'addr_002',
      type: 'billing',
      name: 'John Doe',
      mobile: '9876543210',
      addressLine1: '123 Main St',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      isDefault: true,
    },
    subtotal: 500,
    discount: 50,
    couponDiscount: 0,
    referralDiscount: 0,
    shippingCharges: 49,
    gstAmount: 81,
    total: 580,
    paymentMethod: PaymentMethod.UPI,
    paymentStatus: PaymentStatus.COMPLETED,
    orderStatus: OrderStatus.PENDING,
    prescriptionStatus: PrescriptionStatus.PENDING,
    isRefillOrder: false,
    pincode: '400001',
    createdAt: '2026-02-14T10:00:00Z',
    updatedAt: '2026-02-14T10:00:00Z',
  },
  {
    id: 'ord_002',
    orderNumber: 'DWB-20260214-002',
    customerId: 'cust_002',
    items: [],
    shippingAddress: {
      id: 'addr_003',
      type: 'shipping',
      name: 'Jane Smith',
      mobile: '9876543211',
      addressLine1: '456 Oak Ave',
      city: 'Delhi',
      state: 'Delhi',
      pincode: '110001',
      isDefault: true,
    },
    billingAddress: {
      id: 'addr_004',
      type: 'billing',
      name: 'Jane Smith',
      mobile: '9876543211',
      addressLine1: '456 Oak Ave',
      city: 'Delhi',
      state: 'Delhi',
      pincode: '110001',
      isDefault: true,
    },
    subtotal: 1200,
    discount: 100,
    couponDiscount: 50,
    referralDiscount: 0,
    shippingCharges: 0,
    gstAmount: 189,
    total: 1239,
    paymentMethod: PaymentMethod.CREDIT_CARD,
    paymentStatus: PaymentStatus.COMPLETED,
    orderStatus: OrderStatus.PRESCRIPTION_VERIFIED,
    prescriptionStatus: PrescriptionStatus.VERIFIED,
    isRefillOrder: false,
    pincode: '110001',
    createdAt: '2026-02-14T11:00:00Z',
    updatedAt: '2026-02-14T11:00:00Z',
  },
];

const sampleInventoryAlerts: InventoryAlert[] = [
  {
    id: 'alert_001',
    medicineId: 'med_001',
    medicineName: 'Dolo 650',
    currentStock: 5,
    alertLevel: StockAlertLevel.CRITICAL,
    message: 'Stock below reorder level',
    isResolved: false,
    createdAt: '2026-02-14T09:00:00Z',
  },
  {
    id: 'alert_002',
    medicineId: 'med_002',
    medicineName: 'Azithromycin 500mg',
    currentStock: 12,
    alertLevel: StockAlertLevel.LOW,
    message: 'Stock approaching minimum level',
    isResolved: false,
    createdAt: '2026-02-14T08:00:00Z',
  },
];

const sampleStaff: AdminStaff[] = [
  {
    id: 'staff_001',
    email: 'admin@dawabag.com',
    mobile: '9876543200',
    password: '',
    firstName: 'Super',
    lastName: 'Admin',
    role: UserRole.SUPER_ADMIN,
    permissions: ['all'],
    isActive: true,
    isSuperAdmin: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'staff_002',
    email: 'pharmacist@dawabag.com',
    mobile: '9876543201',
    password: '',
    firstName: 'Rajesh',
    lastName: 'Kumar',
    role: UserRole.PHARMACIST,
    permissions: ['verify_prescription', 'view_orders'],
    isActive: true,
    isSuperAdmin: false,
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 'staff_003',
    email: 'packing@dawabag.com',
    mobile: '9876543202',
    password: '',
    firstName: 'Priya',
    lastName: 'Sharma',
    role: UserRole.PACKING_STAFF,
    permissions: ['pack_orders', 'print_labels'],
    isActive: true,
    isSuperAdmin: false,
    createdAt: '2026-01-20T00:00:00Z',
    updatedAt: '2026-01-20T00:00:00Z',
  },
  {
    id: 'staff_004',
    email: 'delivery@dawabag.com',
    mobile: '9876543203',
    password: '',
    firstName: 'Amit',
    lastName: 'Patel',
    role: UserRole.DELIVERY_STAFF,
    permissions: ['view_dispatched', 'update_delivery'],
    isActive: true,
    isSuperAdmin: false,
    createdAt: '2026-01-25T00:00:00Z',
    updatedAt: '2026-01-25T00:00:00Z',
  },
];

type DashboardTab = 'overview' | 'orders' | 'inventory' | 'vendors' | 'staff' | 'reports';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  
  // Stats for overview
  const stats = {
    totalOrders: 156,
    pendingOrders: 23,
    totalSales: 245680,
    totalCustomers: 4521,
    lowStockAlerts: 5,
    pendingPrescriptions: 12,
  };

  const tabs: { id: DashboardTab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'overview',
      label: 'Overview',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      ),
    },
    {
      id: 'orders',
      label: 'Orders',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
    },
    {
      id: 'inventory',
      label: 'Inventory',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
    },
    {
      id: 'vendors',
      label: 'Vendors',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      id: 'staff',
      label: 'Staff',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
    {
      id: 'reports',
      label: 'Reports',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
  ];

  const getStatusColor = (status: OrderStatus) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'payment_verified':
        return 'bg-blue-100 text-blue-800';
      case 'prescription_pending':
        return 'bg-orange-100 text-orange-800';
      case 'prescription_verified':
        return 'bg-green-100 text-green-800';
      case 'prescription_rejected':
        return 'bg-red-100 text-red-800';
      case 'packed':
        return 'bg-purple-100 text-purple-800';
      case 'dispatched':
        return 'bg-indigo-100 text-indigo-800';
      case 'delivered':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getRoleBadge = (role: UserRole) => {
    const colors: Record<UserRole, string> = {
      super_admin: 'bg-red-100 text-red-800',
      admin: 'bg-purple-100 text-purple-800',
      pharmacist: 'bg-blue-100 text-blue-800',
      packing_staff: 'bg-yellow-100 text-yellow-800',
      delivery_staff: 'bg-green-100 text-green-800',
      customer: 'bg-gray-100 text-gray-800',
      doctor: 'bg-teal-100 text-teal-800',
      pharmacy: 'bg-indigo-100 text-indigo-800',
    };
    return colors[role] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Link href="/" className="text-2xl font-bold text-teal-600">Dawabag</Link>
              <span className="ml-2 px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded">Admin</span>
            </div>
            <div className="flex items-center space-x-4">
              <button className="p-2 text-gray-500 hover:text-gray-700">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </button>
              <div className="flex items-center">
                <span className="text-sm font-medium text-gray-700">Super Admin</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar */}
          <aside className="w-full lg:w-64">
            <nav className="bg-white rounded-lg shadow-sm p-4 space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg ${
                    activeTab === tab.id
                      ? 'bg-teal-50 text-teal-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  {tab.icon}
                  <span className="ml-3">{tab.label}</span>
                </button>
              ))}
            </nav>
          </aside>

          {/* Main Content */}
          <main className="flex-1">
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-white rounded-lg shadow-sm p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-500">Total Orders</p>
                        <p className="text-2xl font-bold text-gray-900">{stats.totalOrders}</p>
                      </div>
                      <div className="p-3 bg-blue-50 rounded-full">
                        <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-gray-500">
                      <span className="text-yellow-600">{stats.pendingOrders} pending</span>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg shadow-sm p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-500">Total Sales</p>
                        <p className="text-2xl font-bold text-gray-900">₹{stats.totalSales.toLocaleString()}</p>
                      </div>
                      <div className="p-3 bg-green-50 rounded-full">
                        <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-gray-500">
                      <span className="text-green-600">+12% this month</span>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg shadow-sm p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-500">Customers</p>
                        <p className="text-2xl font-bold text-gray-900">{stats.totalCustomers.toLocaleString()}</p>
                      </div>
                      <div className="p-3 bg-purple-50 rounded-full">
                        <svg className="h-6 w-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-gray-500">
                      <span className="text-green-600">+45 this week</span>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg shadow-sm p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-500">Low Stock Alerts</p>
                        <p className="text-2xl font-bold text-gray-900">{stats.lowStockAlerts}</p>
                      </div>
                      <div className="p-3 bg-red-50 rounded-full">
                        <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-gray-500">
                      <span className="text-red-600">Requires attention</span>
                    </div>
                  </div>
                </div>

                {/* Recent Orders */}
                <div className="bg-white rounded-lg shadow-sm">
                  <div className="px-6 py-4 border-b">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">Recent Orders</h3>
                      <button 
                        onClick={() => setActiveTab('orders')}
                        className="text-sm text-teal-600 hover:text-teal-700"
                      >
                        View All
                      </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order ID</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {sampleOrders.map((order) => (
                          <tr key={order.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-teal-600">
                              {order.orderNumber}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {order.shippingAddress.name}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              ₹{order.total}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(order.orderStatus)}`}>
                                {order.orderStatus.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {new Date(order.createdAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Inventory Alerts */}
                <div className="bg-white rounded-lg shadow-sm">
                  <div className="px-6 py-4 border-b">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">Low Stock Alerts</h3>
                      <button 
                        onClick={() => setActiveTab('inventory')}
                        className="text-sm text-teal-600 hover:text-teal-700"
                      >
                        View Inventory
                      </button>
                    </div>
                  </div>
                  <div className="p-6">
                    <div className="space-y-4">
                      {sampleInventoryAlerts.map((alert) => (
                        <div key={alert.id} className="flex items-center justify-between p-4 bg-red-50 rounded-lg">
                          <div className="flex items-center">
                            <div className={`p-2 rounded-full ${
                              alert.alertLevel === 'critical' ? 'bg-red-100' : 'bg-yellow-100'
                            }`}>
                              <svg className={`h-5 w-5 ${alert.alertLevel === 'critical' ? 'text-red-600' : 'text-yellow-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                            </div>
                            <div className="ml-4">
                              <p className="text-sm font-medium text-gray-900">{alert.medicineName}</p>
                              <p className="text-sm text-gray-500">{alert.message}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-gray-900">Stock: {alert.currentStock}</p>
                            <button className="text-sm text-teal-600 hover:text-teal-700">Create PO</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Orders Tab */}
            {activeTab === 'orders' && (
              <div className="bg-white rounded-lg shadow-sm">
                <div className="px-6 py-4 border-b">
                  <h3 className="text-lg font-semibold">All Orders</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order ID</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Items</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payment</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Prescription</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {sampleOrders.map((order) => (
                        <tr key={order.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-teal-600">
                            {order.orderNumber}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <p className="text-gray-900">{order.shippingAddress.name}</p>
                            <p className="text-gray-500">{order.shippingAddress.mobile}</p>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {order.items.length} items
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            ₹{order.total}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm text-green-600 capitalize">{order.paymentStatus}</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(order.orderStatus)}`}>
                              {order.orderStatus.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {order.prescriptionStatus ? (
                              <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                order.prescriptionStatus === 'verified' ? 'bg-green-100 text-green-800' :
                                order.prescriptionStatus === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {order.prescriptionStatus}
                              </span>
                            ) : (
                              <span className="text-gray-400">N/A</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <button className="text-teal-600 hover:text-teal-700">View</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Staff Tab */}
            {activeTab === 'staff' && (
              <div className="bg-white rounded-lg shadow-sm">
                <div className="px-6 py-4 border-b flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Staff Management</h3>
                  <button className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">
                    Add Staff
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mobile</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Login</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {sampleStaff.map((staff) => (
                        <tr key={staff.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {staff.firstName} {staff.lastName}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {staff.email}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {staff.mobile}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getRoleBadge(staff.role)}`}>
                              {staff.role.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              staff.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {staff.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {staff.lastLogin || 'Never'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <button className="text-teal-600 hover:text-teal-700 mr-3">Edit</button>
                            <button className="text-red-600 hover:text-red-700">Deactivate</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Reports Tab */}
            {activeTab === 'reports' && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h3 className="text-lg font-semibold mb-6">Reports Dashboard</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <button className="p-6 border-2 border-gray-200 rounded-lg hover:border-teal-500 hover:bg-teal-50 transition-colors text-left">
                    <svg className="h-8 w-8 text-teal-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <h4 className="font-semibold text-gray-900">Sales Report</h4>
                    <p className="text-sm text-gray-500">View sales by date, product, category</p>
                  </button>

                  <button className="p-6 border-2 border-gray-200 rounded-lg hover:border-teal-500 hover:bg-teal-50 transition-colors text-left">
                    <svg className="h-8 w-8 text-teal-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                    <h4 className="font-semibold text-gray-900">Inventory Report</h4>
                    <p className="text-sm text-gray-500">Stock levels, expiry, movement</p>
                  </button>

                  <button className="p-6 border-2 border-gray-200 rounded-lg hover:border-teal-500 hover:bg-teal-50 transition-colors text-left">
                    <svg className="h-8 w-8 text-teal-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
                    </svg>
                    <h4 className="font-semibold text-gray-900">GSTR Reports</h4>
                    <p className="text-sm text-gray-500">GSTR 1, 2, 3B, 9 export</p>
                  </button>

                  <button className="p-6 border-2 border-gray-200 rounded-lg hover:border-teal-500 hover:bg-teal-50 transition-colors text-left">
                    <svg className="h-8 w-8 text-teal-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                    <h4 className="font-semibold text-gray-900">Discount Report</h4>
                    <p className="text-sm text-gray-500">Coupons, offers, referrals</p>
                  </button>

                  <button className="p-6 border-2 border-gray-200 rounded-lg hover:border-teal-500 hover:bg-teal-50 transition-colors text-left">
                    <svg className="h-8 w-8 text-teal-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    <h4 className="font-semibold text-gray-900">Tax Report</h4>
                    <p className="text-sm text-gray-500">GST collection, input credit</p>
                  </button>

                  <button className="p-6 border-2 border-gray-200 rounded-lg hover:border-teal-500 hover:bg-teal-50 transition-colors text-left">
                    <svg className="h-8 w-8 text-teal-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <h4 className="font-semibold text-gray-900">Purchase Report</h4>
                    <p className="text-sm text-gray-500">PO, vendor, expenses</p>
                  </button>
                </div>
              </div>
            )}

            {/* Inventory Tab */}
            {activeTab === 'inventory' && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold">Inventory Management</h3>
                  <div className="flex items-center space-x-3">
                    <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                      Export
                    </button>
                    <button className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">
                      Add Stock
                    </button>
                  </div>
                </div>
                <p className="text-gray-500">Inventory management features including stock alerts, expiry tracking, and multi-warehouse support would be displayed here.</p>
              </div>
            )}

            {/* Vendors Tab */}
            {activeTab === 'vendors' && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold">Vendor Management</h3>
                  <button className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">
                    Add Vendor
                  </button>
                </div>
                <p className="text-gray-500">Vendor management including drug license, GST details, payment terms, and PO generation would be displayed here.</p>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
