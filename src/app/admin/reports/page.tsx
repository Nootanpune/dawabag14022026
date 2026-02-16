// =====================================================
// DAWABAG - Admin Reports Page
// =====================================================

"use client";

import { useState } from 'react';
import Button from '@/components/ui/Button';

const salesData = [
  { month: 'Aug 2025', orders: 145, revenue: 125000, growth: 12 },
  { month: 'Sep 2025', orders: 168, revenue: 148000, growth: 18 },
  { month: 'Oct 2025', orders: 189, revenue: 165000, growth: 11 },
  { month: 'Nov 2025', orders: 210, revenue: 189000, growth: 14 },
  { month: 'Dec 2025', orders: 256, revenue: 235000, growth: 24 },
  { month: 'Jan 2026', orders: 234, revenue: 212000, growth: -9 },
  { month: 'Feb 2026', orders: 189, revenue: 175000, growth: -15 },
];

const categoryData = [
  { category: 'Pain Relief', sales: 45000, percentage: 25 },
  { category: 'Antibiotics', sales: 36000, percentage: 20 },
  { category: 'Diabetes', sales: 32400, percentage: 18 },
  { category: 'Vitamins', sales: 27000, percentage: 15 },
  { category: 'Allergy', sales: 21600, percentage: 12 },
  { category: 'Others', sales: 18000, percentage: 10 },
];

const topProducts = [
  { name: 'Dolo 650', sales: 12500, quantity: 450 },
  { name: 'Azithromycin 500mg', sales: 9800, quantity: 105 },
  { name: 'Metformin 500mg', sales: 8500, quantity: 148 },
  { name: 'Cetirizine 10mg', sales: 7200, quantity: 160 },
  { name: 'Omeprazole 20mg', sales: 6800, quantity: 110 },
];

export default function AdminReportsPage() {
  const [reportType, setReportType] = useState('sales');
  const [dateRange, setDateRange] = useState('monthly');

  const totalRevenue = salesData.reduce((sum, d) => sum + d.revenue, 0);
  const totalOrders = salesData.reduce((sum, d) => sum + d.orders, 0);
  const avgOrderValue = totalRevenue / totalOrders;

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
          <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
          <div className="flex gap-2">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="px-4 py-2 border rounded-lg"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </select>
            <Button variant="outline">📥 Export PDF</Button>
            <Button variant="outline">📊 Export Excel</Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <p className="text-sm text-gray-500">Total Revenue</p>
            <p className="text-2xl font-bold text-gray-900">₹{(totalRevenue / 100000).toFixed(2)}L</p>
            <p className="text-sm text-green-600 mt-1">↑ 8.5% vs last period</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-6">
            <p className="text-sm text-gray-500">Total Orders</p>
            <p className="text-2xl font-bold text-gray-900">{totalOrders}</p>
            <p className="text-sm text-green-600 mt-1">↑ 12% vs last period</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-6">
            <p className="text-sm text-gray-500">Avg Order Value</p>
            <p className="text-2xl font-bold text-gray-900">₹{avgOrderValue.toFixed(0)}</p>
            <p className="text-sm text-green-600 mt-1">↑ 5% vs last period</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-6">
            <p className="text-sm text-gray-500">Prescription Orders</p>
            <p className="text-2xl font-bold text-gray-900">{(totalOrders * 0.4).toFixed(0)}</p>
            <p className="text-sm text-gray-500 mt-1">40% of total</p>
          </div>
        </div>

        {/* Report Tabs */}
        <div className="flex gap-2 mb-6">
          {['sales', 'products', 'categories', 'gstr'].map((type) => (
            <button
              key={type}
              onClick={() => setReportType(type)}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                reportType === type ? 'bg-teal-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              {type === 'sales' && '📈 Sales Report'}
              {type === 'products' && '💊 Top Products'}
              {type === 'categories' && '📦 Categories'}
              {type === 'gstr' && '📋 GSTR Reports'}
            </button>
          ))}
        </div>

        {reportType === 'sales' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sales Chart */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold mb-4">Revenue Trend</h3>
              <div className="h-64 flex items-end justify-between gap-2">
                {salesData.map((data, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center">
                    <div
                      className="w-full bg-teal-500 rounded-t"
                      style={{ height: `${(data.revenue / 250000) * 100}%` }}
                    />
                    <span className="text-xs text-gray-500 mt-2">{data.month.split(' ')[0]}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Monthly Breakdown */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold mb-4">Monthly Breakdown</h3>
              <div className="space-y-4">
                {salesData.map((data, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">{data.month}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-medium">₹{data.revenue.toLocaleString()}</span>
                      <span className={`text-xs ${data.growth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {data.growth >= 0 ? '↑' : '↓'} {Math.abs(data.growth)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {reportType === 'products' && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold mb-4">Top Selling Products</h3>
            <table className="min-w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 text-sm font-medium text-gray-500">Rank</th>
                  <th className="text-left py-3 text-sm font-medium text-gray-500">Product</th>
                  <th className="text-right py-3 text-sm font-medium text-gray-500">Quantity Sold</th>
                  <th className="text-right py-3 text-sm font-medium text-gray-500">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((product, i) => (
                  <tr key={i} className="border-b">
                    <td className="py-3">{i + 1}</td>
                    <td className="py-3 font-medium">{product.name}</td>
                    <td className="py-3 text-right">{product.quantity}</td>
                    <td className="py-3 text-right font-medium">₹{product.sales.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {reportType === 'categories' && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold mb-4">Sales by Category</h3>
            <div className="space-y-4">
              {categoryData.map((cat, i) => (
                <div key={i}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">{cat.category}</span>
                    <span>₹{cat.sales.toLocaleString()} ({cat.percentage}%)</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-teal-500 h-3 rounded-full"
                      style={{ width: `${cat.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {reportType === 'gstr' && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold mb-4">GSTR Reports</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <Button variant="outline" className="h-16">📄 GSTR-1</Button>
              <Button variant="outline" className="h-16">📄 GSTR-2</Button>
              <Button variant="outline" className="h-16">📄 GSTR-3B</Button>
            </div>
            <p className="text-sm text-gray-500">
              GSTR reports are generated monthly based on sales data. Download reports for tax filing purposes.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
