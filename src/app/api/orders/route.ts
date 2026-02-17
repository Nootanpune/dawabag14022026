// =====================================================
// DAWABAG - Orders API Route
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { generateId } from '@/lib/utils';

// In-memory orders storage (replace with database)
const orders: Map<string, any[]> = new Map();

export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  const role = request.headers.get('x-user-role');
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '10');

  let allOrders: any[] = [];

  if (role === 'admin' || role === 'superadmin') {
    // Admin sees all orders
    allOrders = Array.from(orders.values()).flat();
  } else if (userId) {
    // Regular user sees their orders
    allOrders = orders.get(userId) || [];
  } else {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Filter by status
  if (status && status !== 'all') {
    allOrders = allOrders.filter(o => o.status === status);
  }

  // Sort by date (newest first)
  allOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Pagination
  const start = (page - 1) * limit;
  const paginated = allOrders.slice(start, start + limit);

  return NextResponse.json({
    success: true,
    data: paginated,
    pagination: {
      page,
      limit,
      total: allOrders.length,
      totalPages: Math.ceil(allOrders.length / limit),
    },
  });
}

export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      items,
      shippingAddress,
      paymentMethod,
      prescription,
      couponCode,
      notes,
    } = body;

    // Validate required fields
    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
    }

    if (!shippingAddress) {
      return NextResponse.json({ error: 'Shipping address required' }, { status: 400 });
    }

    // Calculate order totals
    const subtotal = items.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);
    const tax = subtotal * 0.12; // 12% GST
    const deliveryCharges = subtotal > 500 ? 0 : 50;
    const discount = 0; // Apply coupon discount if provided
    const total = subtotal + tax + deliveryCharges - discount;

    // Check if prescription required
    const requiresPrescription = items.some((item: any) => item.requiresPrescription);
    if (requiresPrescription && !prescription) {
      return NextResponse.json({ 
        error: 'Prescription required for scheduled medicines',
        requiresPrescription: true 
      }, { status: 400 });
    }

    // Generate order ID
    const orderId = generateId('order');

    // Create order
    const order = {
      id: orderId,
      orderNumber: `DWA${Date.now()}`,
      userId,
      items,
      shippingAddress,
      prescription: prescription || null,
      paymentMethod,
      couponCode: couponCode || null,
      notes: notes || null,
      status: 'pending', // pending, confirmed, processing, shipped, delivered, cancelled
      paymentStatus: 'pending', // pending, paid, failed
      prescriptionStatus: prescription ? 'pending' : null, // pending, verified, rejected
      pricing: {
        subtotal,
        tax,
        deliveryCharges,
        discount,
        total,
      },
      timeline: [
        {
          status: 'pending',
          timestamp: new Date().toISOString(),
          note: 'Order placed successfully',
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Store order
    if (!orders.has(userId)) {
      orders.set(userId, []);
    }
    orders.get(userId)!.push(order);

    return NextResponse.json({
      success: true,
      data: order,
    }, { status: 201 });
  } catch (error) {
    console.error('Order error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  const role = request.headers.get('x-user-role');
  
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { orderId, status, paymentStatus, prescriptionStatus, note } = body;

    // Find order
    let order: any = null;
    let orderUserId: string | null = null;

    for (const [uid, userOrders] of orders.entries()) {
      const found = userOrders.find((o: any) => o.id === orderId);
      if (found) {
        order = found;
        orderUserId = uid;
        break;
      }
    }

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Check authorization
    if (order.userId !== userId && role !== 'admin' && role !== 'superadmin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Update fields
    if (status) {
      order.status = status;
      order.timeline.push({
        status,
        timestamp: new Date().toISOString(),
        note: note || `Order ${status}`,
      });
    }

    if (paymentStatus) {
      order.paymentStatus = paymentStatus;
    }

    if (prescriptionStatus) {
      order.prescriptionStatus = prescriptionStatus;
      order.timeline.push({
        status: 'prescription',
        timestamp: new Date().toISOString(),
        note: `Prescription ${prescriptionStatus}`,
      });
    }

    order.updatedAt = new Date().toISOString();

    return NextResponse.json({
      success: true,
      data: order,
    });
  } catch (error) {
    console.error('Order update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
