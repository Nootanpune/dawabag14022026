// =====================================================
// DAWABAG - Staff API Route
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { generateId, hashPassword } from '@/lib/utils';

// Staff users storage
const staff: Map<string, any> = new Map();

// Initialize with sample admin
const adminId = generateId('staff');
staff.set(adminId, {
  id: adminId,
  email: 'admin@dawabag.com',
  firstName: 'Admin',
  lastName: 'User',
  role: 'admin',
  department: 'Administration',
  isActive: true,
  createdAt: new Date().toISOString(),
});

export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  const role = request.headers.get('x-user-role');
  const { searchParams } = new URL(request.url);
  const staffRole = searchParams.get('role');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '10');

  // Only admin can view staff
  if (role !== 'admin' && role !== 'superadmin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let allStaff = Array.from(staff.values());

  // Filter by role
  if (staffRole) {
    allStaff = allStaff.filter(s => s.role === staffRole);
  }

  // Sort by name
  allStaff.sort((a, b) => a.firstName.localeCompare(b.firstName));

  // Pagination
  const start = (page - 1) * limit;
  const paginated = allStaff.slice(start, start + limit);

  return NextResponse.json({
    success: true,
    data: paginated,
    pagination: {
      page,
      limit,
      total: allStaff.length,
      totalPages: Math.ceil(allStaff.length / limit),
    },
  });
}

export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  const role = request.headers.get('x-user-role');
  
  // Only admin can create staff
  if (role !== 'admin' && role !== 'superadmin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { 
      email, 
      firstName, 
      lastName, 
      staffRole, 
      department, 
      mobile,
      password 
    } = body;

    // Validate required fields
    if (!email || !firstName || !staffRole || !password) {
      return NextResponse.json({ 
        error: 'Email, first name, role and password are required' 
      }, { status: 400 });
    }

    // Validate role
    const validRoles = ['admin', 'superadmin', 'pharmacist', 'packing', 'delivery'];
    if (!validRoles.includes(staffRole)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    // Check if email exists
    const existing = Array.from(staff.values()).find(s => s.email === email);
    if (existing) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 400 });
    }

    const id = generateId('staff');
    const passwordHash = await hashPassword(password);

    const newStaff = {
      id,
      email,
      firstName,
      lastName,
      mobile: mobile || null,
      role: staffRole,
      department: department || null,
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    staff.set(id, { ...newStaff, passwordHash });

    return NextResponse.json({
      success: true,
      data: { ...newStaff, passwordHash: undefined },
    }, { status: 201 });
  } catch (error) {
    console.error('Staff create error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  const role = request.headers.get('x-user-role');
  
  // Only admin can update staff
  if (role !== 'admin' && role !== 'superadmin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { staffId, firstName, lastName, mobile, department, isActive } = body;

    if (!staffId) {
      return NextResponse.json({ error: 'Staff ID required' }, { status: 400 });
    }

    const staffMember = staff.get(staffId);
    if (!staffMember) {
      return NextResponse.json({ error: 'Staff not found' }, { status: 404 });
    }

    // Prevent deactivating self
    if (staffId === userId && isActive === false) {
      return NextResponse.json({ error: 'Cannot deactivate yourself' }, { status: 400 });
    }

    // Update fields
    if (firstName) staffMember.firstName = firstName;
    if (lastName) staffMember.lastName = lastName;
    if (mobile) staffMember.mobile = mobile;
    if (department) staffMember.department = department;
    if (typeof isActive === 'boolean') staffMember.isActive = isActive;

    staff.set(staffId, staffMember);

    return NextResponse.json({
      success: true,
      data: { ...staffMember, passwordHash: undefined },
    });
  } catch (error) {
    console.error('Staff update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  const role = request.headers.get('x-user-role');
  
  // Only superadmin can delete staff
  if (role !== 'superadmin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const staffId = searchParams.get('id');

  if (!staffId) {
    return NextResponse.json({ error: 'Staff ID required' }, { status: 400 });
  }

  // Prevent deleting self
  if (staffId === userId) {
    return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 });
  }

  const staffMember = staff.get(staffId);
  if (!staffMember) {
    return NextResponse.json({ error: 'Staff not found' }, { status: 404 });
  }

  staff.delete(staffId);

  return NextResponse.json({ success: true });
}
