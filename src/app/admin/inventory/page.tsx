// =====================================================
// DAWABAG - Admin Inventory Management Page
// =====================================================

"use client";

import { useState } from 'react';
import Button from '@/components/ui/Button';
import { Medicine, InventoryAlert, StockAlertLevel } from '@/types';

const mockInventory: Medicine[] = [
  {
    id: 'med_001', sku: 'SKU001', name: 'Dolo 650', genericName: 'Paracetamol', brandName: 'Dolo',
    saltComposition: 'Paracetamol 650mg', manufacturer: 'Micro Labs Ltd', description: 'Pain reliever',
    usage: 'Take as directed', storageInstructions: 'Store in cool place', category: 'Pain Relief',
    dosageForm: 'tablet', strength: '650mg', packSize: 15, unit: 'tablets', mrp: 35, offerPrice: 28,
    discount: 20, stock: 100, minStockLevel: 20, reorderLevel: 10, requiresPrescription: false,
    isScheduledDrug: false, images: [], isActive: true, createdAt: '', updatedAt: '',
  },
  {
    id: 'med_002', sku: 'SKU002', name: 'Azithromycin 500mg', genericName: 'Azithromycin', brandName: 'Azithral',
    saltComposition: 'Azithromycin 500mg', manufacturer: 'Alembic Ltd', description: 'Antibiotic',
    usage: 'Take as directed', storageInstructions: 'Store below 30°C', category: 'Antibiotics',
    dosageForm: 'tablet', strength: '500mg', packSize: 5, unit: 'tablets', mrp: 120, offerPrice: 95,
    discount: 21, stock: 8, minStockLevel: 15, reorderLevel: 8, requiresPrescription: true,
    isScheduledDrug: false, images: [], isActive: true, createdAt: '', updatedAt: '',
  },
  {
    id: 'med_003', sku: 'SKU003', name: 'Metformin 500mg', genericName: 'Metformin', brandName: 'Glycomet',
    saltComposition: 'Metformin 500mg', manufacturer: 'USV Ltd', description: 'Anti-diabetic',
    usage: 'Take with food', storageInstructions: 'Store in cool place', category: 'Diabetes',
    dosageForm: 'tablet', strength: '500mg', packSize: 30, unit: 'tablets', mrp: 75, offerPrice: 58,
    discount: 23, stock: 80, minStockLevel: 25, reorderLevel: 15, requiresPrescription: true,
    isScheduledDrug: false, images: [], isActive: true, createdAt: '', updatedAt: '',
  },
  {
    id: 'med_004', sku: 'SKU004', name: 'Cetirizine 10mg', genericName: 'Cetirizine', brandName: 'Cetzine',
    saltComposition: 'Cetirizine 10mg', manufacturer: 'Glenmark', description: 'Anti-allergic',
    usage: 'Take once daily', storageInstructions: 'Store below 25°C', category: 'Allergy',
    dosageForm: 'tablet', strength: '10mg', packSize: 10, unit: 'tablets', mrp: 65, offerPrice: 45,
    discount: 31, stock: 120, minStockLevel: 30, reorderLevel: 20, requiresPrescription: false,
    isScheduledDrug: false, images: [], isActive: true, createdAt: '', updatedAt: '',
  },
  {
    id: 'med_005', sku: 'SKU005', name: 'Omeprazole 20mg', genericName: 'Omeprazole', brandName: 'Omez',
    saltComposition: 'Omeprazole 20mg', manufacturer: "Dr. Reddy's", description: 'PPI for acidity',
    usage: 'Take before meals', storageInstructions: 'Store in cool place', category: 'Acidity',
    dosageForm: 'capsule', strength: '20mg', packSize: 15, unit: 'capsules', mrp: 85, offerPrice: 62,
    discount: 27, stock: 5, minStockLevel: 20, reorderLevel: 12, requiresPrescription: false,
    isScheduledDrug: false, images: [], isActive: true, createdAt: '', updatedAt: '',
  },
  {
    id: 'med_006', sku: 'SKU006', name: 'Neurobion Forte', genericName: 'Vitamin B Complex', brandName: 'Neurobion',
    saltComposition: 'B1+B6+B12', manufacturer: 'Abbott', description: 'Vitamin supplement',
    usage: 'Take once daily', storageInstructions: 'Store below 25°C', category: 'Vitamins',
    dosageForm: 'tablet', strength: '100mg', packSize: 30, unit: 'tablets', mrp: 180, offerPrice: 145,
    discount: 19, stock: 45, minStockLevel: 15, reorderLevel: 10, requiresPrescription: false,
    isScheduledDrug: false, images: [], isActive: true, createdAt: '', updatedAt: '',
  },
];

const mockAlerts: InventoryAlert[] = [
  { id: 'alert_001', medicineId: 'med_002', medicineName: 'Azithromycin 500mg', currentStock: 8, alertLevel: 'critical', message: 'Stock below reorder level!', isResolved: false, createdAt: '2026-02-14T10:00:00Z' },
  { id: 'alert_002', medicineId: 'med_005', medicineName: 'Omeprazole 20mg', currentStock: 5, alertLevel: 'critical', message: 'Critical stock level!', isResolved: false, createdAt: '2026-02-14T11:00:00Z' },
];

export default function AdminInventoryPage() {
  const [inventory, setInventory] = useState<Medicine[]>(mockInventory);
  const [alerts] = useState<InventoryAlert[]>(mockAlerts);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [stockFilter, setStockFilter] = useState('All');

  const categories = ['All', 'Pain Relief', 'Antibiotics', 'Diabetes', 'Allergy', 'Acidity', 'Vitamins'];

  const getStockStatus = (medicine: Medicine) => {
    if (medicine.stock <= medicine.reorderLevel) return 'critical';
    if (medicine.stock <= medicine.minStockLevel) return 'low';
    return 'ok';
  };

  const getStockColor = (status: string) => {
    switch (status) {
      case 'critical': return 'bg-red-100 text-red-800';
      case 'low': return 'bg-orange-100 text-orange-800';
      default: return 'bg-green-100 text-green-800';
    }
  };

  const filteredInventory = inventory.filter(med => {
    const matchesSearch = med.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         med.brandName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         med.sku.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'All' || med.category === categoryFilter;
    const matchesStock = stockFilter === 'All' || 
      (stockFilter === 'low' && getStockStatus(med) === 'low') ||
      (stockFilter === 'critical' && getStockStatus(med) === 'critical') ||
      (stockFilter === 'ok' && getStockStatus(med) === 'ok');
    return matchesSearch && matchesCategory && matchesStock;
  });

  const updateStock = (medicineId: string, delta: number) => {
    setInventory(inventory.map(med => 
      med.id === medicineId 
        ? { ...med, stock: Math.max(0, med.stock + delta) }
        : med
    ));
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
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-8">Inventory Management</h1>

        {/* Stock Alerts */}
        {alerts.filter(a => !a.isResolved).length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Stock Alerts</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {alerts.filter(a => !a.isResolved).map((alert) => (
                <div key={alert.id} className={`p-4 rounded-lg ${alert.alertLevel === 'critical' ? 'bg-red-50 border border-red-200' : 'bg-orange-50 border border-orange-200'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{alert.medicineName}</p>
                      <p className="text-sm text-gray-600">{alert.message}</p>
                      <p className="text-sm text-gray-500 mt-1">Current Stock: {alert.currentStock}</p>
                    </div>
                    <Button size="sm" variant="outline">Create PO</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="Search by name, brand, or SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg"
            >
              {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg"
            >
              <option value="All">All Stock</option>
              <option value="critical">Critical</option>
              <option value="low">Low</option>
              <option value="ok">OK</option>
            </select>
          </div>
        </div>

        {/* Inventory Table */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Medicine</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Manufacturer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredInventory.map((medicine) => {
                const status = getStockStatus(medicine);
                return (
                  <tr key={medicine.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono">{medicine.sku}</td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-gray-900">{medicine.name}</p>
                      <p className="text-sm text-gray-500">{medicine.strength} - {medicine.packSize} {medicine.unit}</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{medicine.category}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{medicine.manufacturer}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <button
                          onClick={() => updateStock(medicine.id, -1)}
                          className="px-2 py-1 bg-gray-100 rounded hover:bg-gray-200"
                        >
                          -
                        </button>
                        <span className="mx-3 text-sm font-medium">{medicine.stock}</span>
                        <button
                          onClick={() => updateStock(medicine.id, 1)}
                          className="px-2 py-1 bg-gray-100 rounded hover:bg-gray-200"
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStockColor(status)}`}>
                        {status === 'ok' ? 'In Stock' : status === 'low' ? 'Low Stock' : 'Critical'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Button size="sm" variant="outline">Edit</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Summary Stats */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow-sm p-4">
            <p className="text-sm text-gray-500">Total Products</p>
            <p className="text-2xl font-bold">{inventory.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4">
            <p className="text-sm text-gray-500">In Stock</p>
            <p className="text-2xl font-bold text-green-600">{inventory.filter(m => getStockStatus(m) === 'ok').length}</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4">
            <p className="text-sm text-gray-500">Low Stock</p>
            <p className="text-2xl font-bold text-orange-600">{inventory.filter(m => getStockStatus(m) === 'low').length}</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4">
            <p className="text-sm text-gray-500">Critical</p>
            <p className="text-2xl font-bold text-red-600">{inventory.filter(m => getStockStatus(m) === 'critical').length}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
