// =====================================================
// DAWABAG - Vendors API Route
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { generateId } from '@/lib/utils';

// Sample vendors data
const vendors = [
  {
    id: 'vendor_001',
    name: 'MediSource Pharmaceuticals',
    contactPerson: 'Rajesh Kumar',
    email: 'orders@medisource.com',
    phone: '+91-9876543210',
    address: '123 Pharmaceutical Market, Mumbai',
    gstNumber: '27AABCM1234A1Z5',
    drugLicenseNumber: 'DL-2020-001234',
    drugLicenseExpiry: '2026-12-31',
    paymentTerms: 'Net 30',
    creditLimit: 500000,
    currentOutstanding: 125000,
    rating: 4.5,
    isActive: true,
  },
  {
    id: 'vendor_002',
    name: 'CureWell Distributors',
    contactPerson: 'Suresh Patel',
    email: 'sales@curewell.com',
    phone: '+91-9876543211',
    address: '456 Medical Avenue, Delhi',
    gstNumber: '07AABCU5678A1Z9',
    drugLicenseNumber: 'DL-2020-005678',
    drugLicenseExpiry: '2027-06-30',
    paymentTerms: 'Net 45',
    creditLimit: 750000,
    currentOutstanding: 280000,
    rating: 4.2,
    isActive: true,
  },
  {
    id: 'vendor_003',
    name: 'HealthBridge Pharma',
    contactPerson: 'Anita Sharma',
    email: 'orders@healthbridge.com',
    phone: '+91-9876543212',
    address: '789 Pharma Lane, Bangalore',
    gstNumber: '29ABCHP9012A1Z3',
    drugLicenseNumber: 'DL-2021-009012',
    drugLicenseExpiry: '2026-03-31',
    paymentTerms: 'Net 15',
    creditLimit: 300000,
    currentOutstanding: 85000,
    rating: 4.8,
    isActive: true,
  },
];

// Purchase orders
const purchaseOrders: Map<string, any[]> = new Map();

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const vendorId = searchParams.get('vendorId');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '10');

  if (type === 'orders' && vendorId) {
    // Get purchase orders for a vendor
    const orders = purchaseOrders.get(vendorId) || [];
    
    return NextResponse.json({
      success: true,
      data: orders,
    });
  }

  // Return all vendors
  return NextResponse.json({
    success: true,
    data: vendors.filter(v => v.isActive),
  });
}

export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  const role = request.headers.get('x-user-role');
  
  if (!userId || (role !== 'admin' && role !== 'superadmin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { action, ...data } = body;

    if (action === 'create_vendor') {
      // Validate required fields
      const required = ['name', 'contactPerson', 'email', 'phone', 'gstNumber', 'drugLicenseNumber'];
      for (const field of required) {
        if (!data[field]) {
          return NextResponse.json({ error: `${field} is required` }, { status: 400 });
        }
      }

      const id = generateId('vendor');
      const vendor = {
        id,
        ...data,
        rating: 0,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vendors.push(vendor);

      return NextResponse.json({
        success: true,
        data: vendor,
      }, { status: 201 });
    }

    if (action === 'create_po') {
      // Create purchase order
      const { vendorId, items, notes } = data;

      if (!vendorId || !items || items.length === 0) {
        return NextResponse.json({ error: 'Vendor and items required' }, { status: 400 });
      }

      const vendor = vendors.find(v => v.id === vendorId);
      if (!vendor) {
        return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
      }

      // Calculate totals
      const subtotal = items.reduce((sum: number, item: any) => 
        sum + (item.rate * item.quantity), 0);
      const tax = subtotal * 0.12; // 12% GST
      const total = subtotal + tax;

      const poId = generateId('po');
      const purchaseOrder = {
        id: poId,
        poNumber: `PO${Date.now()}`,
        vendorId,
        vendorName: vendor.name,
        items,
        subtotal,
        tax,
        total,
        status: 'pending', // pending, approved, ordered, received, cancelled
        notes: notes || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (!purchaseOrders.has(vendorId)) {
        purchaseOrders.set(vendorId, []);
      }
      purchaseOrders.get(vendorId)!.push(purchaseOrder);

      return NextResponse.json({
        success: true,
        data: purchaseOrder,
      }, { status: 201 });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Vendor error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  const role = request.headers.get('x-user-role');
  
  if (!userId || (role !== 'admin' && role !== 'superadmin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { vendorId, status, items, notes } = body;

    if (vendorId) {
      // Update vendor
      const vendor = vendors.find(v => v.id === vendorId) as any;
      if (!vendor) {
        return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
      }

      if (status) {
        vendor.isActive = status === 'active';
      }
      vendor.updatedAt = new Date().toISOString();

      return NextResponse.json({
        success: true,
        data: vendor,
      });
    }

    if (items) {
      // Update purchase order
      // In production, find by PO ID
      return NextResponse.json({ error: 'PO update not implemented' }, { status: 400 });
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  } catch (error) {
    console.error('Vendor update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
