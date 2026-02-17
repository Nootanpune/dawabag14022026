// =====================================================
// DAWABAG - Auth API Route
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { generateId, generateReferralCode, hashPassword } from '@/lib/utils';

// Mock user storage (replace with database)
const users: Map<string, any> = new Map();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...data } = body;

    if (action === 'register') {
      // Check if email exists
      const existingUser = Array.from(users.values()).find(u => u.email === data.email);
      if (existingUser) {
        return NextResponse.json({ error: 'Email already registered' }, { status: 400 });
      }

      // Create user
      const id = generateId('user');
      const referralCode = generateReferralCode(8);
      const passwordHash = await hashPassword(data.password);

      const user = {
        id,
        email: data.email,
        mobile: data.mobile,
        firstName: data.firstName,
        lastName: data.lastName,
        role: 'customer',
        referralCode,
        referredBy: data.referralCode || null,
        walletBalance: 0,
        loyaltyPoints: data.referralCode ? 50 : 0, // Bonus points for using referral
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      users.set(id, { ...user, passwordHash });

      // Generate token (in production, use JWT)
      const token = Buffer.from(JSON.stringify({ userId: id, role: 'customer' })).toString('base64');

      return NextResponse.json({
        success: true,
        user: { ...user, passwordHash: undefined },
        token,
      });
    }

    if (action === 'login') {
      const user = Array.from(users.values()).find(u => u.email === data.email);
      if (!user) {
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
      }

      // In production, verify password hash
      const token = Buffer.from(JSON.stringify({ userId: user.id, role: user.role })).toString('base64');

      return NextResponse.json({
        success: true,
        user: { ...user, passwordHash: undefined },
        token,
      });
    }

    if (action === 'logout') {
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader) {
    return NextResponse.json({ error: 'No token provided' }, { status: 401 });
  }

  try {
    const token = authHeader.replace('Bearer ', '');
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
    const user = users.get(decoded.userId);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ user: { ...user, passwordHash: undefined } });
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
}
