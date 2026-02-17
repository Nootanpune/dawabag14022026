// =====================================================
// DAWABAG - Reports API Route
// =====================================================

import { NextRequest, NextResponse } from 'next/server';

// Sample data for reports (in production, aggregate from database)
const salesData = [
  { date: '2024-01-01', orders: 45, revenue: 125000, category: 'Pain Relief' },
  { date: '2024-01-01', orders: 32, revenue: 89000, category: 'Antibiotics' },
  { date: '2024-01-01', orders: 28, revenue: 72000, category: 'Diabetes' },
  { date: '2024-01-02', orders: 52, revenue: 145000, category: 'Pain Relief' },
  { date: '2024-01-02', orders: 38, revenue: 98000, category: 'Antibiotics' },
  { date: '2024-01-02', orders: 25, revenue: 65000, category: 'Diabetes' },
];

export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  const role = request.headers.get('x-user-role');
  const { searchParams } = new URL(request.url);
  const reportType = searchParams.get('type');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  // Only admin can access reports
  if (role !== 'admin' && role !== 'superadmin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    if (reportType === 'sales') {
      // Sales summary report
      const totalOrders = 1520;
      const totalRevenue = 4250000;
      const totalTax = 510000;
      const totalDiscount = 380000;
      
      return NextResponse.json({
        success: true,
        data: {
          summary: {
            totalOrders,
            totalRevenue,
            totalTax,
            totalDiscount,
            netRevenue: totalRevenue - totalDiscount,
            averageOrderValue: totalRevenue / totalOrders,
          },
          byCategory: [
            { category: 'Pain Relief', orders: 450, revenue: 1250000 },
            { category: 'Antibiotics', orders: 320, revenue: 890000 },
            { category: 'Diabetes', orders: 280, revenue: 720000 },
            { category: 'Allergy', orders: 210, revenue: 520000 },
            { category: 'Vitamins', orders: 260, revenue: 870000 },
          ],
          byMonth: [
            { month: 'Jan 2024', orders: 152, revenue: 425000 },
            { month: 'Feb 2024', orders: 168, revenue: 468000 },
            { month: 'Mar 2024', orders: 185, revenue: 518000 },
          ],
        },
      });
    }

    if (reportType === 'inventory') {
      // Inventory report
      return NextResponse.json({
        success: true,
        data: {
          summary: {
            totalProducts: 250,
            totalStock: 50000,
            lowStockItems: 15,
            outOfStockItems: 3,
            totalValue: 2500000,
          },
          lowStock: [
            { medicine: 'Dolo 650', sku: 'SKU001', currentStock: 15, minStock: 20 },
            { medicine: 'Azithromycin 500mg', sku: 'SKU002', currentStock: 8, minStock: 15 },
            { medicine: 'Metformin 500mg', sku: 'SKU003', currentStock: 12, minStock: 25 },
          ],
          outOfStock: [
            { medicine: 'Disprin', sku: 'SKU010', currentStock: 0 },
            { medicine: 'Corex', sku: 'SKU011', currentStock: 0 },
          ],
          byCategory: [
            { category: 'Pain Relief', count: 45, value: 450000 },
            { category: 'Antibiotics', count: 38, value: 380000 },
            { category: 'Diabetes', count: 28, value: 280000 },
          ],
        },
      });
    }

    if (reportType === 'customers') {
      // Customer report
      return NextResponse.json({
        success: true,
        data: {
          summary: {
            totalCustomers: 2500,
            newCustomers: 150,
            activeCustomers: 1800,
            inactiveCustomers: 700,
          },
          topCustomers: [
            { name: 'John Doe', orders: 25, revenue: 45000 },
            { name: 'Jane Smith', orders: 20, revenue: 38000 },
            { name: 'Bob Wilson', orders: 18, revenue: 32000 },
          ],
          bySource: [
            { source: 'Organic', count: 1200 },
            { source: 'Referral', count: 800 },
            { source: 'Social Media', count: 300 },
            { source: 'Paid Ads', count: 200 },
          ],
        },
      });
    }

    if (reportType === 'orders') {
      // Orders report
      return NextResponse.json({
        success: true,
        data: {
          summary: {
            totalOrders: 1520,
            pendingOrders: 45,
            processingOrders: 28,
            shippedOrders: 15,
            deliveredOrders: 1420,
            cancelledOrders: 12,
          },
          byStatus: [
            { status: 'Pending', count: 45 },
            { status: 'Processing', count: 28 },
            { status: 'Shipped', count: 15 },
            { status: 'Delivered', count: 1420 },
            { status: 'Cancelled', count: 12 },
          ],
          byPaymentMethod: [
            { method: 'COD', count: 800, revenue: 2200000 },
            { method: 'Card', count: 450, revenue: 1250000 },
            { method: 'UPI', count: 270, revenue: 800000 },
          ],
        },
      });
    }

    if (reportType === 'financial') {
      // Financial report
      return NextResponse.json({
        success: true,
        data: {
          summary: {
            totalRevenue: 4250000,
            totalCost: 2975000,
            grossProfit: 1275000,
            taxCollected: 510000,
            discountsGiven: 380000,
          },
          expenses: [
            { category: 'Medicines Cost', amount: 2550000 },
            { category: 'Shipping', amount: 280000 },
            { category: 'Packaging', amount: 95000 },
            { category: 'Returns', amount: 50000 },
          ],
          revenueByMonth: [
            { month: 'Jan', revenue: 425000 },
            { month: 'Feb', revenue: 468000 },
            { month: 'Mar', revenue: 518000 },
          ],
        },
      });
    }

    // Default: return available report types
    return NextResponse.json({
      success: true,
      data: {
        availableReports: [
          { type: 'sales', name: 'Sales Report', description: 'Revenue and order analytics' },
          { type: 'inventory', name: 'Inventory Report', description: 'Stock levels and valuations' },
          { type: 'customers', name: 'Customer Report', description: 'Customer acquisition and retention' },
          { type: 'orders', name: 'Orders Report', description: 'Order status and fulfillment' },
          { type: 'financial', name: 'Financial Report', description: 'Revenue, costs and profits' },
        ],
      },
    });
  } catch (error) {
    console.error('Report error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
