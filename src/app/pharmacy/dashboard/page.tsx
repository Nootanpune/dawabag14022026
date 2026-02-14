// =====================================================
// DAWABAG - Pharmacy Portal
// Addressing URS Pharmacy Gaps
// =====================================================

"use client";

import { useState } from 'react';
import Link from 'next/link';
import { 
  Pharmacy, 
  Order, 
  Medicine,
  VerificationStatus,
  PaymentTerms,
  GSTType
} from '@/types';

// Sample data
const samplePharmacy: Pharmacy = {
  id: 'pharm_001',
  email: 'medicalstore@example.com',
  mobile: '9876543210',
  password: '',
  pharmacyName: 'Apollo Medical Store',
  ownerName: 'John Doe',
  address: 'Shop No. 12, Health Plaza, MG Road',
  city: 'Mumbai',
  state: 'Maharashtra',
  pincode: '400001',
  drugLicenseNumber: 'MH-2020-12345',
  drugLicenseDocument: '/docs/drug-license.pdf',
  foodLicenseNumber: 'FSSAI-2020-67890',
  foodLicenseDocument: '/docs/fssai.pdf',
  gstNumber: '27AABCR1234A1Z5',
  gstType: GSTType.REGULAR,
  kycDocuments: ['/docs/kyc1.pdf'],
  paymentTerms: PaymentTerms.POST_PAID,
  creditLimit: 50000,
  currentCreditUsed: 12500,
  isVerified: true,
  verificationStatus: VerificationStatus.APPROVED,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-02-14T00:00:00Z',
  orders: [],
};

const sampleOrders: Order[] = [
  {
    id: 'ord_001',
    orderNumber: 'DWB-PHARM-20260214-001',
    customerId: '',
    items: [],
    shippingAddress: {
      id: 'addr_001',
      type: 'shipping',
      name: 'Apollo Medical Store',
      mobile: '9876543210',
      addressLine1: 'Shop No. 12, Health Plaza',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      isDefault: true,
    },
    billingAddress: {
      id: 'addr_002',
      type: 'billing',
      name: 'Apollo Medical Store',
      mobile: '9876543210',
      addressLine1: 'Shop No. 12, Health Plaza',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      isDefault: true,
    },
    subtotal: 15000,
    discount: 1500,
    couponDiscount: 0,
    referralDiscount: 0,
    shippingCharges: 0,
    gstAmount: 2430,
    total: 15930,
    paymentMethod: 'credit_card',
    paymentStatus: 'completed',
    orderStatus: 'delivered',
    isRefillOrder: false,
    pincode: '400001',
    pharmacyId: 'pharm_001',
    createdAt: '2026-02-10T10:00:00Z',
    updatedAt: '2026-02-14T10:00:00Z',
  },
  {
    id: 'ord_002',
    orderNumber: 'DWB-PHARM-20260214-002',
    customerId: '',
    items: [],
    shippingAddress: {
      id: 'addr_003',
      type: 'shipping',
      name: 'Apollo Medical Store',
      mobile: '9876543210',
      addressLine1: 'Shop No. 12, Health Plaza',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      isDefault: true,
    },
    billingAddress: {
      id: 'addr_004',
      type: 'billing',
      name: 'Apollo Medical Store',
      mobile: '9876543210',
      addressLine1: 'Shop No. 12, Health Plaza',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      isDefault: true,
    },
    subtotal: 8500,
    discount: 850,
    couponDiscount: 0,
    referralDiscount: 0,
    shippingCharges: 0,
    gstAmount: 1378,
    total: 9028,
    paymentMethod: 'net_banking',
    paymentStatus: 'pending',
    orderStatus: 'pending',
    isRefillOrder: false,
    pincode: '400001',
    pharmacyId: 'pharm_001',
    createdAt: '2026-02-14T09:00:00Z',
    updatedAt: '2026-02-14T09:00:00Z',
  },
];

const samplePharmacyMedicines: Medicine[] = [
  {
    id: 'med_001',
    sku: 'PHARM-SKU001',
    name: 'Dolo 650 (Bulk)',
    genericName: 'Paracetamol',
    brandName: 'Dolo',
    saltComposition: 'Paracetamol 650mg',
    manufacturer: 'Micro Labs Ltd',
    description: 'Pain reliever - Bulk pricing for pharmacies',
    usage: 'Take as directed',
    storageInstructions: 'Store in cool, dry place',
    category: 'Pain Relief',
    dosageForm: 'tablet',
    strength: '650mg',
    packSize: 1000,
    unit: 'tablets',
    mrp: 2300,
    offerPrice: 1650,
    discount: 28,
    stock: 50000,
    minStockLevel: 10000,
    reorderLevel: 5000,
    requiresPrescription: false,
    isScheduledDrug: false,
    images: [],
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'med_002',
    sku: 'PHARM-SKU002',
    name: 'Azithromycin 500mg (Bulk)',
    genericName: 'Azithromycin',
    brandName: 'Azithral',
    saltComposition: 'Azithromycin 500mg',
    manufacturer: 'Alembic Ltd',
    description: 'Antibiotic - Bulk pricing for pharmacies',
    usage: 'Take as directed',
    storageInstructions: 'Store below 30°C',
    category: 'Antibiotics',
    dosageForm: 'tablet',
    strength: '500mg',
    packSize: 500,
    unit: 'tablets',
    mrp: 12000,
    offerPrice: 8500,
    discount: 29,
    stock: 25000,
    minStockLevel: 5000,
    reorderLevel: 2500,
    requiresPrescription: true,
    isScheduledDrug: false,
    images: [],
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'med_003',
    sku: 'PHARM-SKU003',
    name: 'Metformin 500mg (Bulk)',
    genericName: 'Metformin Hydrochloride',
    brandName: 'Glycomet',
    saltComposition: 'Metformin 500mg',
    manufacturer: 'USV Ltd',
    description: 'Anti-diabetic - Bulk pricing for pharmacies',
    usage: 'Take with food',
    storageInstructions: 'Store in cool, dry place',
    category: 'Diabetes',
    dosageForm: 'tablet',
    strength: '500mg',
    packSize: 1000,
    unit: 'tablets',
    mrp: 2500,
    offerPrice: 1800,
    discount: 28,
    stock: 40000,
    minStockLevel: 8000,
    reorderLevel: 4000,
    requiresPrescription: true,
    isScheduledDrug: false,
    images: [],
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

type PharmacyTab = 'dashboard' | 'orders' | 'catalog' | 'account' | 'invoices' | 'settings';

export default function PharmacyDashboard() {
  const [activeTab, setActiveTab] = useState<PharmacyTab>('dashboard');
  const [isLoggedIn, setIsLoggedIn] = useState(true);

  const tabs: { id: PharmacyTab; label: string; icon: JSX.Element }[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
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
      id: 'catalog',
      label: 'Pharmacy Catalog',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      ),
    },
    {
      id: 'account',
      label: 'Account',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      ),
    },
    {
      id: 'invoices',
      label: 'Invoices',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'delivered':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'processing':
        return 'bg-blue-100 text-blue-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-teal-600">Dawabag</h1>
            <p className="text-gray-500 mt-2">Pharmacy Portal</p>
          </div>
          
          <h2 className="text-xl font-semibold text-center mb-6">Pharmacy Login / Signup</h2>
          
          <form className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Drug License Number</label>
              <input
                type="text"
                placeholder="e.g., MH-2020-12345"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Number</label>
              <input
                type="tel"
                placeholder="10-digit mobile number"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                required
              />
            </div>
            
            <button
              type="submit"
              className="w-full py-3 bg-teal-600 text-white font-medium rounded-lg hover:bg-teal-700"
            >
              Verify & Login
            </button>
          </form>
          
          <div className="mt-6 pt-6 border-t text-center">
            <p className="text-sm text-gray-500">
              For verification, submit your drug license, food license (if applicable), GST number, and KYC documents
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Link href="/" className="text-2xl font-bold text-teal-600">Dawabag</Link>
              <span className="ml-2 px-2 py-1 text-xs font-medium bg-indigo-100 text-indigo-800 rounded">Pharmacy</span>
            </div>
            <div className="flex items-center space-x-4">
              <button className="p-2 text-gray-500 hover:text-gray-700">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </button>
              <div className="flex items-center">
                <span className="text-sm font-medium text-gray-700">{samplePharmacy.pharmacyName}</span>
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
                      ? 'bg-indigo-50 text-indigo-700'
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
            {/* Dashboard Tab */}
            {activeTab === 'dashboard' && (
              <div className="space-y-6">
                {/* Account Status Card */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">Account Status</h3>
                      <p className="text-sm text-gray-500">{samplePharmacy.pharmacyName}</p>
                    </div>
                    <span className="px-3 py-1 bg-green-100 text-green-800 text-sm font-medium rounded">
                      {samplePharmacy.isVerified ? 'Verified' : 'Pending Verification'}
                    </span>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-white rounded-lg shadow-sm p-6">
                    <p className="text-sm font-medium text-gray-500">Total Orders</p>
                    <p className="text-2xl font-bold text-gray-900">{sampleOrders.length}</p>
                  </div>
                  <div className="bg-white rounded-lg shadow-sm p-6">
                    <p className="text-sm font-medium text-gray-500">Total Purchases</p>
                    <p className="text-2xl font-bold text-gray-900">₹{sampleOrders.reduce((sum, o) => sum + o.total, 0).toLocaleString()}</p>
                  </div>
                  <div className="bg-white rounded-lg shadow-sm p-6">
                    <p className="text-sm font-medium text-gray-500">Credit Limit</p>
                    <p className="text-2xl font-bold text-indigo-600">₹{samplePharmacy.creditLimit?.toLocaleString()}</p>
                  </div>
                  <div className="bg-white rounded-lg shadow-sm p-6">
                    <p className="text-sm font-medium text-gray-500">Credit Used</p>
                    <p className="text-2xl font-bold text-orange-600">₹{samplePharmacy.currentCreditUsed?.toLocaleString()}</p>
                  </div>
                </div>

                {/* Payment Terms Card */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">Payment Terms</h3>
                      <p className="text-sm text-gray-500">Current: {samplePharmacy.paymentTerms === PaymentTerms.POST_PAID ? 'Post-paid' : 'Prepaid'}</p>
                    </div>
                    <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                      Request Change
                    </button>
                  </div>
                  <p className="text-sm text-gray-500 mt-2">
                    Credit limit: ₹{samplePharmacy.creditLimit?.toLocaleString()} | 
                    Available: ₹{((samplePharmacy.creditLimit || 0) - (samplePharmacy.currentCreditUsed || 0)).toLocaleString()}
                  </p>
                </div>

                {/* Recent Orders */}
                <div className="bg-white rounded-lg shadow-sm">
                  <div className="px-6 py-4 border-b">
                    <h3 className="text-lg font-semibold">Recent Orders</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order ID</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payment</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {sampleOrders.map((order) => (
                          <tr key={order.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-teal-600">
                              {order.orderNumber}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              ₹{order.total.toLocaleString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <span className={`${
                                order.paymentStatus === 'completed' ? 'text-green-600' : 'text-yellow-600'
                              }`}>
                                {order.paymentStatus}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(order.orderStatus)}`}>
                                {order.orderStatus}
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
              </div>
            )}

            {/* Catalog Tab - Different from Customer */}
            {activeTab === 'catalog' && (
              <div className="space-y-6">
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold">Pharmacy Wholesale Catalog</h3>
                      <p className="text-sm text-gray-500">Special B2B pricing for registered pharmacies</p>
                    </div>
                    <span className="px-3 py-1 bg-indigo-100 text-indigo-800 text-sm font-medium rounded">
                      Wholesale Pricing
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {samplePharmacyMedicines.map((medicine) => (
                    <div key={medicine.id} className="bg-white rounded-lg shadow-sm p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h4 className="font-semibold text-gray-900">{medicine.name}</h4>
                          <p className="text-sm text-gray-500">{medicine.genericName}</p>
                        </div>
                        <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
                          {medicine.discount}% off
                        </span>
                      </div>
                      <div className="flex items-baseline space-x-2 mb-2">
                        <span className="text-2xl font-bold text-indigo-600">₹{medicine.offerPrice.toLocaleString()}</span>
                        <span className="text-sm text-gray-400 line-through">₹{medicine.mrp.toLocaleString()}</span>
                      </div>
                      <p className="text-sm text-gray-500 mb-2">
                        Pack Size: {medicine.packSize} {medicine.unit}
                      </p>
                      <p className="text-sm text-gray-500 mb-4">
                        Stock: {medicine.stock.toLocaleString()}
                      </p>
                      {medicine.requiresPrescription && (
                        <span className="inline-block px-2 py-1 text-xs font-medium bg-orange-100 text-orange-800 rounded mb-4">
                          Prescription Required
                        </span>
                      )}
                      <button className="w-full py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 mt-2">
                        Add to Cart
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Account Tab */}
            {activeTab === 'account' && (
              <div className="space-y-6">
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <h3 className="text-lg font-semibold mb-4">Credit Account Summary</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                    <div className="p-4 bg-indigo-50 rounded-lg">
                      <p className="text-sm text-indigo-600 font-medium">Credit Limit</p>
                      <p className="text-2xl font-bold text-indigo-900">₹{samplePharmacy.creditLimit?.toLocaleString()}</p>
                    </div>
                    <div className="p-4 bg-orange-50 rounded-lg">
                      <p className="text-sm text-orange-600 font-medium">Credit Used</p>
                      <p className="text-2xl font-bold text-orange-900">₹{samplePharmacy.currentCreditUsed?.toLocaleString()}</p>
                    </div>
                    <div className="p-4 bg-green-50 rounded-lg">
                      <p className="text-sm text-green-600 font-medium">Available Credit</p>
                      <p className="text-2xl font-bold text-green-900">
                        ₹{((samplePharmacy.creditLimit || 0) - (samplePharmacy.currentCreditUsed || 0)).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="divider"></div>

                  <h4 className="font-semibold mb-4">Payment Terms Request</h4>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                    <p className="text-sm text-yellow-800">
                      <strong>Note:</strong> Post-paid payment terms are available based on your purchase volume. 
                      Request a change to switch between prepaid and post-paid.
                    </p>
                  </div>
                  
                  <div className="flex space-x-4">
                    <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                      Request Post-Paid
                    </button>
                    <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                      View Payment History
                    </button>
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm p-6">
                  <h3 className="text-lg font-semibold mb-4">GST Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">GST Number</p>
                      <p className="font-medium">{samplePharmacy.gstNumber}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">GST Type</p>
                      <p className="font-medium">{samplePharmacy.gstType}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Orders Tab */}
            {activeTab === 'orders' && (
              <div className="bg-white rounded-lg shadow-sm">
                <div className="px-6 py-4 border-b flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Order History</h3>
                  <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                    New Order
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order ID</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payment</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {sampleOrders.map((order) => (
                        <tr key={order.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-teal-600">
                            {order.orderNumber}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            ₹{order.total.toLocaleString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <span className={`${
                              order.paymentStatus === 'completed' ? 'text-green-600' : 'text-yellow-600'
                            }`}>
                              {order.paymentStatus}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(order.orderStatus)}`}>
                              {order.orderStatus}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(order.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <button className="text-indigo-600 hover:text-indigo-700 mr-3">View</button>
                            <button className="text-indigo-600 hover:text-indigo-700">Reorder</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Invoices Tab */}
            {activeTab === 'invoices' && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h3 className="text-lg font-semibold mb-4">Invoice Management</h3>
                <div className="text-center py-8">
                  <svg className="mx-auto h-16 w-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="mt-4 text-gray-500">Download invoices and monthly account statements</p>
                  <div className="mt-4 flex justify-center space-x-4">
                    <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                      Download Invoices
                    </button>
                    <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                      Monthly Statement
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Settings Tab */}
            {activeTab === 'settings' && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h3 className="text-lg font-semibold mb-6">Pharmacy Settings</h3>
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Pharmacy Name</label>
                      <input
                        type="text"
                        defaultValue={samplePharmacy.pharmacyName}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Owner Name</label>
                      <input
                        type="text"
                        defaultValue={samplePharmacy.ownerName}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Drug License Number</label>
                      <input
                        type="text"
                        defaultValue={samplePharmacy.drugLicenseNumber}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                        disabled
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">GST Number</label>
                      <input
                        type="text"
                        defaultValue={samplePharmacy.gstNumber}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                        disabled
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Mobile</label>
                      <input
                        type="tel"
                        defaultValue={samplePharmacy.mobile}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                      <input
                        type="email"
                        defaultValue={samplePharmacy.email}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                  </div>
                  
                  <div className="pt-4">
                    <button className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                      Save Changes
                    </button>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
