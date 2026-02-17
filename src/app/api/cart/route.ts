// =====================================================
// DAWABAG - Cart API Route
// =====================================================

import { NextRequest, NextResponse } from 'next/server';

// In-memory cart storage (replace with database)
const carts: Map<string, any[]> = new Map();

// Sample medicines for cart validation
const medicines = [
  { id: 'med_001', name: 'Dolo 650', offerPrice: 28, stock: 100, requiresPrescription: false },
  { id: 'med_002', name: 'Azithromycin 500mg', offerPrice: 95, stock: 50, requiresPrescription: true },
  { id: 'med_003', name: 'Metformin 500mg', offerPrice: 58, stock: 80, requiresPrescription: true },
  { id: 'med_004', name: 'Cetirizine 10mg', offerPrice: 45, stock: 120, requiresPrescription: false },
  { id: 'med_005', name: 'Omeprazole 20mg', offerPrice: 62, stock: 60, requiresPrescription: false },
];

function getCart(userId: string) {
  if (!carts.has(userId)) {
    carts.set(userId, []);
  }
  return carts.get(userId)!;
}

export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cart = getCart(userId);
  
  // Calculate totals
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const tax = subtotal * 0.12; // 12% GST
  const deliveryCharges = subtotal > 500 ? 0 : 50;
  const total = subtotal + tax + deliveryCharges;

  return NextResponse.json({
    success: true,
    data: {
      items: cart,
      summary: {
        itemCount: cart.reduce((sum, item) => sum + item.quantity, 0),
        subtotal,
        tax,
        deliveryCharges,
        total,
      },
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
    const { medicineId, quantity = 1 } = body;

    // Validate medicine exists
    const medicine = medicines.find(m => m.id === medicineId);
    if (!medicine) {
      return NextResponse.json({ error: 'Medicine not found' }, { status: 404 });
    }

    // Check stock
    if (medicine.stock < quantity) {
      return NextResponse.json({ error: 'Insufficient stock' }, { status: 400 });
    }

    const cart = getCart(userId);
    
    // Check if item already in cart
    const existingItem = cart.find(item => item.medicineId === medicineId);
    if (existingItem) {
      existingItem.quantity += quantity;
    } else {
      cart.push({
        medicineId,
        name: medicine.name,
        price: medicine.offerPrice,
        quantity,
        requiresPrescription: medicine.requiresPrescription,
        addedAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        items: cart,
        itemCount: cart.reduce((sum, item) => sum + item.quantity, 0),
      },
    });
  } catch (error) {
    console.error('Cart error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { medicineId, quantity } = body;

    const cart = getCart(userId);
    const item = cart.find(i => i.medicineId === medicineId);

    if (!item) {
      return NextResponse.json({ error: 'Item not in cart' }, { status: 404 });
    }

    if (quantity <= 0) {
      // Remove item
      const index = cart.findIndex(i => i.medicineId === medicineId);
      cart.splice(index, 1);
    } else {
      item.quantity = quantity;
    }

    return NextResponse.json({ success: true, data: cart });
  } catch (error) {
    console.error('Cart update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const medicineId = searchParams.get('medicineId');

  const cart = getCart(userId);

  if (medicineId) {
    // Remove specific item
    const index = cart.findIndex(i => i.medicineId === medicineId);
    if (index > -1) {
      cart.splice(index, 1);
    }
  } else {
    // Clear entire cart
    cart.length = 0;
  }

  return NextResponse.json({ success: true, data: cart });
}
