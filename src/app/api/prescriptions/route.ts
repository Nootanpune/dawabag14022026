// =====================================================
// DAWABAG - Prescriptions API Route
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { generateId } from '@/lib/utils';

// In-memory prescriptions storage (replace with database)
const prescriptions: Map<string, any[]> = new Map();

export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  const role = request.headers.get('x-user-role');
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '10');

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let allPrescriptions: any[] = [];

  if (role === 'admin' || role === 'superadmin') {
    // Admin sees all prescriptions
    allPrescriptions = Array.from(prescriptions.values()).flat();
  } else {
    // User sees their prescriptions
    allPrescriptions = prescriptions.get(userId) || [];
  }

  // Filter by status
  if (status && status !== 'all') {
    allPrescriptions = allPrescriptions.filter(p => p.status === status);
  }

  // Sort by date (newest first)
  allPrescriptions.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

  // Pagination
  const start = (page - 1) * limit;
  const paginated = allPrescriptions.slice(start, start + limit);

  return NextResponse.json({
    success: true,
    data: paginated,
    pagination: {
      page,
      limit,
      total: allPrescriptions.length,
      totalPages: Math.ceil(allPrescriptions.length / limit),
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
      patientName, 
      patientAge, 
      patientGender,
      doctorName,
      doctorRegistrationNumber,
      diagnosis,
      medicines,
      notes,
      // In production, file would be uploaded to cloud storage
      prescriptionImage,
    } = body;

    // Validate required fields
    if (!patientName || !patientAge || !doctorName) {
      return NextResponse.json({ 
        error: 'Patient name, age and doctor name are required' 
      }, { status: 400 });
    }

    // Age verification for scheduled drugs
    if (patientAge < 18) {
      return NextResponse.json({ 
        error: 'Patient must be 18 years or older',
        requiresGuardian: true,
      }, { status: 400 });
    }

    // Generate prescription ID
    const prescriptionId = generateId('rx');

    // Create prescription
    const prescription = {
      id: prescriptionId,
      prescriptionNumber: `RX${Date.now()}`,
      userId,
      patientName,
      patientAge,
      patientGender: patientGender || 'Not specified',
      doctorName,
      doctorRegistrationNumber: doctorRegistrationNumber || null,
      diagnosis: diagnosis || null,
      medicines: medicines || [],
      notes: notes || null,
      // In production, this would be a URL to stored image
      prescriptionImage: prescriptionImage || null,
      status: 'pending', // pending, verified, rejected
      verificationNotes: null,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days validity
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Store prescription
    if (!prescriptions.has(userId)) {
      prescriptions.set(userId, []);
    }
    prescriptions.get(userId)!.push(prescription);

    return NextResponse.json({
      success: true,
      data: prescription,
    }, { status: 201 });
  } catch (error) {
    console.error('Prescription error:', error);
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
    const { prescriptionId, status, verificationNotes } = body;

    // Only admin can verify prescriptions
    if (role !== 'admin' && role !== 'superadmin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Find prescription
    let prescription: any = null;
    let prescriptionUserId: string | null = null;

    for (const [uid, userPrescriptions] of prescriptions.entries()) {
      const found = userPrescriptions.find((p: any) => p.id === prescriptionId);
      if (found) {
        prescription = found;
        prescriptionUserId = uid;
        break;
      }
    }

    if (!prescription) {
      return NextResponse.json({ error: 'Prescription not found' }, { status: 404 });
    }

    // Update prescription
    prescription.status = status;
    if (verificationNotes) {
      prescription.verificationNotes = verificationNotes;
    }
    prescription.updatedAt = new Date().toISOString();

    return NextResponse.json({
      success: true,
      data: prescription,
    });
  } catch (error) {
    console.error('Prescription update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
