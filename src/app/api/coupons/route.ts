// =====================================================
// DAWABAG - Coupons API Route
// =====================================================

import { NextRequest, NextResponse } from 'next/server';

// Coupon codes database
const coupons = [
  {
    code: 'DAWA20',
    type: 'percentage',
    value: 20,
    minOrder: 500,
    maxDiscount: 200,
    description: '20% off on orders above ₹500',
    validFrom: '2024-01-01',
    validUntil: '2026-12-31',
    usageLimit: 1000,
    usageCount: 456,
    applicableCategories: null, // All categories
    isActive: true,
  },
  {
    code: 'FIRST100',
    type: 'fixed',
    value: 100,
    minOrder: 300,
    maxDiscount: 100,
    description: '₹100 off on first order',
    validFrom: '2024-01-01',
    validUntil: '2026-12-31',
    usageLimit: 5000,
    usageCount: 2341,
    applicableCategories: null,
    isActive: true,
  },
  {
    code: 'HEALTH15',
    type: 'percentage',
    value: 15,
    minOrder: 400,
    maxDiscount: 150,
    description: '15% off on health products',
    validFrom: '2024-01-01',
    validUntil: '2026-12-31',
    usageLimit: 2000,
    usageCount: 890,
    applicableCategories: ['Health', 'Wellness', 'Vitamins'],
    isActive: true,
  },
  {
    code: 'SAVE50',
    type: 'fixed',
    value: 50,
    minOrder: 250,
    maxDiscount: 50,
    description: '₹50 flat discount',
    validFrom: '2024-01-01',
    validUntil: '2026-12-31',
    usageLimit: 5000,
    usageCount: 3210,
    applicableCategories: null,
    isActive: true,
  },
  {
    code: 'DIABETES25',
    type: 'percentage',
    value: 25,
    minOrder: 600,
    maxDiscount: 300,
    description: '25% off on diabetes medicines',
    validFrom: '2024-01-01',
    validUntil: '2026-12-31',
    usageLimit: 1000,
    usageCount: 234,
    applicableCategories: ['Diabetes'],
    isActive: true,
  },
];

// Used coupons per user (in production, store in database)
const userCoupons: Map<string, string[]> = new Map();

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    // Validate specific coupon
    const coupon = coupons.find(c => c.code.toUpperCase() === code.toUpperCase());
    
    if (!coupon) {
      return NextResponse.json({
        success: true,
        data: {
          valid: false,
          message: 'Invalid coupon code',
        },
      });
    }

    // Check if active
    if (!coupon.isActive) {
      return NextResponse.json({
        success: true,
        data: {
          valid: false,
          message: 'Coupon is not active',
        },
      });
    }

    // Check validity period
    const now = new Date();
    const validFrom = new Date(coupon.validFrom);
    const validUntil = new Date(coupon.validUntil);

    if (now < validFrom || now > validUntil) {
      return NextResponse.json({
        success: true,
        data: {
          valid: false,
          message: 'Coupon has expired',
        },
      });
    }

    // Check usage limit
    if (coupon.usageCount >= coupon.usageLimit) {
      return NextResponse.json({
        success: true,
        data: {
          valid: false,
          message: 'Coupon usage limit exceeded',
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        valid: true,
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        minOrder: coupon.minOrder,
        maxDiscount: coupon.maxDiscount,
        description: coupon.description,
      },
    });
  }

  // Return all active coupons
  const activeCoupons = coupons.filter(c => c.isActive);
  
  return NextResponse.json({
    success: true,
    data: activeCoupons.map(c => ({
      code: c.code,
      description: c.description,
      type: c.type,
      value: c.value,
      minOrder: c.minOrder,
    })),
  });
}

export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { code, cartTotal, category } = body;

    if (!code || !cartTotal) {
      return NextResponse.json({ error: 'Coupon code and cart total required' }, { status: 400 });
    }

    // Find coupon
    const coupon = coupons.find(c => c.code.toUpperCase() === code.toUpperCase());
    
    if (!coupon) {
      return NextResponse.json({ error: 'Invalid coupon code' }, { status: 400 });
    }

    // Validate coupon
    if (!coupon.isActive) {
      return NextResponse.json({ error: 'Coupon is not active' }, { status: 400 });
    }

    const now = new Date();
    const validFrom = new Date(coupon.validFrom);
    const validUntil = new Date(coupon.validUntil);

    if (now < validFrom || now > validUntil) {
      return NextResponse.json({ error: 'Coupon has expired' }, { status: 400 });
    }

    if (coupon.usageCount >= coupon.usageLimit) {
      return NextResponse.json({ error: 'Coupon usage limit exceeded' }, { status: 400 });
    }

    if (cartTotal < coupon.minOrder) {
      return NextResponse.json({ 
        error: `Minimum order of ₹${coupon.minOrder} required`,
        minOrder: coupon.minOrder,
      }, { status: 400 });
    }

    // Check category applicability
    if (coupon.applicableCategories && category) {
      if (!coupon.applicableCategories.includes(category)) {
        return NextResponse.json({ 
          error: 'Coupon not applicable for this category',
          applicableCategories: coupon.applicableCategories,
        }, { status: 400 });
      }
    }

    // Check if user already used this coupon
    const usedCoupons = userCoupons.get(userId) || [];
    if (usedCoupons.includes(coupon.code)) {
      return NextResponse.json({ error: 'You have already used this coupon' }, { status: 400 });
    }

    // Calculate discount
    let discount = 0;
    if (coupon.type === 'percentage') {
      discount = (cartTotal * coupon.value) / 100;
    } else {
      discount = coupon.value;
    }

    // Apply max discount cap
    discount = Math.min(discount, coupon.maxDiscount);

    // Mark coupon as used
    usedCoupons.push(coupon.code);
    userCoupons.set(userId, usedCoupons);
    
    // Update usage count
    coupon.usageCount++;

    return NextResponse.json({
      success: true,
      data: {
        code: coupon.code,
        discount,
        finalTotal: cartTotal - discount,
      },
    });
  } catch (error) {
    console.error('Coupon error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
