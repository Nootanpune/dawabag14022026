// =====================================================
// DAWABAG - Doctors API Route
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { generateId, generateReferralCode } from '@/lib/utils';

// Doctor registrations
const doctors: Map<string, any> = new Map();

// Sample doctor
const sampleDoctorId = generateId('doctor');
doctors.set(sampleDoctorId, {
  id: sampleDoctorId,
  email: 'doctor@dawabag.com',
  firstName: 'Dr. Rajesh',
  lastName: 'Khanna',
  registrationNumber: 'MH-2020-12345',
  specialization: 'General Medicine',
  clinicAddress: '123 Medical Center, Mumbai',
  phone: '+91-9876543210',
  referralCode: generateReferralCode(8),
  totalReferrals: 0,
  bonusPoints: 0,
  isVerified: true,
  isActive: true,
  createdAt: new Date().toISOString(),
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const doctorId = searchParams.get('id');

  if (type === 'verify_registration') {
    // Verify registration number
    const regNumber = searchParams.get('registrationNumber');
    if (!regNumber) {
      return NextResponse.json({ error: 'Registration number required' }, { status: 400 });
    }

    const doctor = Array.from(doctors.values()).find(d => d.registrationNumber === regNumber);
    
    return NextResponse.json({
      success: true,
      data: {
        exists: !!doctor,
        verified: doctor?.isVerified || false,
        doctor: doctor ? {
          name: `Dr. ${doctor.firstName} ${doctor.lastName}`,
          specialization: doctor.specialization,
        } : null,
      },
    });
  }

  if (type === 'referrals') {
    // Get referral stats
    const referralCode = searchParams.get('referralCode');
    if (!referralCode) {
      return NextResponse.json({ error: 'Referral code required' }, { status: 400 });
    }

    const doctor = Array.from(doctors.values()).find(d => d.referralCode === referralCode);
    if (!doctor) {
      return NextResponse.json({ error: 'Doctor not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        totalReferrals: doctor.totalReferrals,
        bonusPoints: doctor.bonusPoints,
        referralCode: doctor.referralCode,
      },
    });
  }

  // Return all verified doctors
  return NextResponse.json({
    success: true,
    data: Array.from(doctors.values()).filter(d => d.isVerified && d.isActive),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...data } = body;

    if (action === 'register') {
      // Check if registration number exists
      const existing = Array.from(doctors.values()).find(
        d => d.registrationNumber === data.registrationNumber
      );
      if (existing) {
        return NextResponse.json({ 
          error: 'Registration number already registered',
          verified: existing.isVerified,
        }, { status: 400 });
      }

      const id = generateId('doctor');
      const referralCode = generateReferralCode(8);

      const doctor = {
        id,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        registrationNumber: data.registrationNumber,
        specialization: data.specialization || 'General Medicine',
        clinicAddress: data.clinicAddress || null,
        phone: data.phone || null,
        referralCode,
        totalReferrals: 0,
        bonusPoints: 0,
        isVerified: false, // Requires admin approval
        isActive: true,
        createdAt: new Date().toISOString(),
      };

      doctors.set(id, doctor);

      return NextResponse.json({
        success: true,
        data: {
          message: 'Registration submitted for verification',
          referralCode,
        },
      }, { status: 201 });
    }

    if (action === 'login') {
      const doctor = Array.from(doctors.values()).find(
        d => d.email === data.email
      );

      if (!doctor) {
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
      }

      if (!doctor.isActive) {
        return NextResponse.json({ error: 'Account is deactivated' }, { status: 403 });
      }

      const token = Buffer.from(JSON.stringify({ 
        userId: doctor.id, 
        role: 'doctor' 
      })).toString('base64');

      return NextResponse.json({
        success: true,
        user: { ...doctor },
        token,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Doctor error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  const role = request.headers.get('x-user-role');

  // Only doctors or admin can update
  if (role !== 'doctor' && role !== 'admin' && role !== 'superadmin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { doctorId, isVerified, isActive } = body;

    // Find doctor
    let targetDoctor: any = null;
    
    if (role === 'doctor' && userId) {
      // Doctors can only update themselves
      targetDoctor = doctors.get(userId);
    } else {
      // Admin can update any doctor
      targetDoctor = doctors.get(doctorId);
    }

    if (!targetDoctor) {
      return NextResponse.json({ error: 'Doctor not found' }, { status: 404 });
    }

    // Admin can verify or deactivate
    if (role === 'admin' || role === 'superadmin') {
      if (typeof isVerified === 'boolean') {
        targetDoctor.isVerified = isVerified;
      }
      if (typeof isActive === 'boolean') {
        targetDoctor.isActive = isActive;
      }
    }

    // Update referral stats
    if (body.addReferral) {
      targetDoctor.totalReferrals += 1;
      targetDoctor.bonusPoints += 50; // 50 points per referral
    }

    doctors.set(targetDoctor.id, targetDoctor);

    return NextResponse.json({
      success: true,
      data: targetDoctor,
    });
  } catch (error) {
    console.error('Doctor update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
