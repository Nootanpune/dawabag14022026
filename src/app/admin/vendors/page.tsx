// =====================================================
// DAWABAG - Admin Vendor Management Page
// =====================================================

"use client";

import { useState } from 'react';
import Button from '@/components/ui/Button';
import { Vendor, PurchaseOrder, GSTType } from '@/types';
import { generatePONumber } from '@/lib/utils';

const mockVendors: Vendor[] = [
  {
    id: 'vend_001', name: 'Micro Labs Ltd', email: 'orders@microlabs.com', mobile: '9876543210',
    address: 'Bangalore, Karnataka', city: 'Bangalore', state: 'Karnataka', pincode: '560001',
    drugLicenseNumber: 'KA1234567890', drugLicenseDocument: '', gstNumber: '29AABCI1234A1Z5',
    gstType: GSTType.REGULAR, openingBalance: 0, balanceType: 'payable', productsSupplied: ['Dolo 650', 'Combiflam'],
    deliveryTime: 3, paymentTerms: 'Net 30', kycDocuments: [], isActive: true, rating: 4.5,
    createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z',
  },
  {
    id: 'vend_002', name: 'Alembic Ltd', email: 'sales@alembic.com', mobile: '9876543211',
    address: 'Vadodara, Gujarat', city: 'Vadodara', state: 'Gujarat', pincode: '390003',
    drugLicenseNumber: 'GJ9876543210', drugLicenseDocument: '', gstNumber: '24AABCI5678A1Z5',
    gstType: GSTType.REGULAR, openingBalance: 50000, balanceType: 'payable', productsSupplied: ['Azithromycin'],
    deliveryTime: 5, paymentTerms: 'Net 45', kycDocuments: [], isActive: true, rating: 4.2,
    createdAt: '2025-02-15T00:00:00Z', updatedAt: '2026-02-10T00:00:00Z',
  },
  {
    id: 'vend_003', name: 'USV Ltd', email: 'contact@usvindia.com', mobile: '9876543212',
    address: 'Mumbai, Maharashtra', city: 'Mumbai', state: 'Maharashtra', pincode: '400001',
    drugLicenseNumber: 'MH1122334455', drugLicenseDocument: '', gstNumber: '27AABCU1234A1Z5',
    gstType: GSTType.REGULAR, openingBalance: 0, balanceType: 'payable', productsSupplied: ['Metformin 500mg'],
    deliveryTime: 2, paymentTerms: 'Net 30', kycDocuments: [], isActive: true, rating: 4.8,
    createdAt: '2025-03-01T00:00:00Z', updatedAt: '2026-02-12T00:00:00Z',
  },
  {
    id: 'vend_004', name: 'Glenmark Pharmaceuticals', email: 'orders@glenmarkpharma.com', mobile: '9876543213',
    address: 'Mumbai, Maharashtra', city: 'Mumbai', state: 'Maharashtra', pincode: '400093',
    drugLicenseNumber: 'MH5566778899', drugLicenseDocument: '', gstNumber: '27AABCG5678A1Z5',
    gstType: GSTType.REGULAR, openingBalance: 75000, balanceType: 'payable', productsSupplied: ['Cetirizine', 'Omez'],
    deliveryTime: 3, paymentTerms: 'Net 30', kycDocuments: [], isActive: true, rating: 4.0,
    createdAt: '2025-04-10T00:00:00Z', updatedAt: '2026-02-08T00:00:00Z',
  },
];

const mockPurchaseOrders: PurchaseOrder[] = [
  {
    id: 'po_001', poNumber: 'PO-2026-0001', vendorId: 'vend_001',
    items: [{ id: '1', medicineId: 'med_001', quantity: 100, rate: 20, gst: 18, total: 2360 }],
    subtotal: 2000, gstAmount: 360, total: 2360, status: 'received',
    expectedDeliveryDate: '2026-02-20', actualDeliveryDate: '2026-02-18',
    notes: '', createdBy: 'admin', createdAt: '2026-02-10T00:00:00Z', updatedAt: '2026-02-18T00:00:00Z',
  },
  {
    id: 'po_002', poNumber: 'PO-2026-0002', vendorId: 'vend_002',
    items: [{ id: '2', medicineId: 'med_002', quantity: 50, rate: 80, gst: 18, total: 4720 }],
    subtotal: 4000, gstAmount: 720, total: 4720, status: 'sent',
    expectedDeliveryDate: '2026-02-25', notes: 'Urgent requirement', createdBy: 'admin',
    createdAt: '2026-02-14T00:00:00Z', updatedAt: '2026-02-14T00:00:00Z',
  },
];

export default function AdminVendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>(mockVendors);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(mockPurchaseOrders);
  const [activeTab, setActiveTab] = useState('vendors');
  const [showCreatePO, setShowCreatePO] = useState(false);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'received': return 'bg-green-100 text-green-800';
      case 'sent': return 'bg-blue-100 text-blue-800';
      case 'acknowledged': return 'bg-purple-100 text-purple-800';
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getVendorName = (vendorId: string) => {
    const vendor = vendors.find(v => v.id === vendorId);
    return vendor?.name || 'Unknown';
  };

  const createPO = () => {
    const newPO: PurchaseOrder = {
      id: 'po_' + Date.now(),
      poNumber: generatePONumber(),
      vendorId: 'vend_001',
      items: [{ id: '1', medicineId: 'med_001', quantity: 100, rate: 25, gst: 18, total: 2950 }],
      subtotal: 2500, gstAmount: 450, total: 2950, status: 'draft',
      expectedDeliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      createdBy: 'admin', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    setPurchaseOrders([newPO, ...purchaseOrders]);
    setShowCreatePO(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <a href="/admin/dashboard" className="text-xl font-bold text-teal-600">Dawabag</a>
              <span className="ml-2 text-sm text-gray-500">Admin</span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Vendor & Purchase Management</h1>
          <div className="flex gap-2">
            <Button onClick={() => setActiveTab('vendors')} variant={activeTab === 'vendors' ? 'primary' : 'outline'}>
              Vendors
            </Button>
            <Button onClick={() => setActiveTab('po')} variant={activeTab === 'po' ? 'primary' : 'outline'}>
              Purchase Orders
            </Button>
          </div>
        </div>

        {activeTab === 'vendors' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {vendors.map((vendor) => (
              <div key={vendor.id} className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="font-semibold text-gray-900">{vendor.name}</h3>
                  <span className="text-sm text-yellow-500">★ {vendor.rating}</span>
                </div>
                <div className="space-y-2 text-sm text-gray-600">
                  <p>📍 {vendor.city}, {vendor.state}</p>
                  <p>📞 {vendor.mobile}</p>
                  <p>📧 {vendor.email}</p>
                  <p>🚚 Delivery: {vendor.deliveryTime} days</p>
                  <p>💰 Terms: {vendor.paymentTerms}</p>
                  <p>🏷️ GST: {vendor.gstNumber}</p>
                </div>
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm text-gray-500">Products: {vendor.productsSupplied.join(', ')}</p>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1">View</Button>
                  <Button size="sm" variant="outline" className="flex-1">Create PO</Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'po' && (
          <div>
            <div className="flex justify-end mb-4">
              <Button onClick={() => setShowCreatePO(true)}>+ Create Purchase Order</Button>
            </div>

            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">PO Number</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Items</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expected</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {purchaseOrders.map((po) => (
                    <tr key={po.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono">{po.poNumber}</td>
                      <td className="px-6 py-4 text-sm">{getVendorName(po.vendorId)}</td>
                      <td className="px-6 py-4 text-sm">{po.items.length} item(s)</td>
                      <td className="px-6 py-4 text-sm font-medium">₹{po.total.toFixed(2)}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(po.status)}`}>
                          {po.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">{po.expectedDeliveryDate}</td>
                      <td className="px-6 py-4">
                        <Button size="sm" variant="outline">View</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {showCreatePO && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h2 className="text-xl font-semibold mb-4">Create Purchase Order</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Select Vendor</label>
                  <select className="w-full px-3 py-2 border rounded-lg">
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Product</label>
                  <select className="w-full px-3 py-2 border rounded-lg">
                    <option>Dolo 650 - Micro Labs</option>
                    <option>Azithromycin - Alembic</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Quantity</label>
                    <input type="number" className="w-full px-3 py-2 border rounded-lg" defaultValue={100} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Rate (₹)</label>
                    <input type="number" className="w-full px-3 py-2 border rounded-lg" defaultValue={25} />
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <Button onClick={createPO} className="flex-1">Create PO</Button>
                <Button variant="outline" onClick={() => setShowCreatePO(false)} className="flex-1">Cancel</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
