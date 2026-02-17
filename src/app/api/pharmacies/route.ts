// =====================================================
// DAWABAG - Pharmacies API Route
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { generateId } from '@/lib/utils';

// Pharmacy registrations
const pharmacies: Map<string, any> = new Map();

// Sample pharmacy
const samplePharmacyId = generateId('pharmacy');
pharmacies.set(samplePharmacyId, {
  id: samplePharmacyId,
  email: 'pharmacy@dawabag.com',
  pharmacyName: 'City Medical Store',
  ownerName: 'Mahesh Patel',
  drugLicenseNumber: 'DL-2020-56789',
  drugLicenseExpiry: '2027-12-31',
  gstNumber: '27AAFCP1234A1Z5',
  address: '456 Pharma Street, Mumbai',
  city: 'Mumbai',
  state: 'Maharashtra',
  pincode: '400001',
  phone: '+91-9876543210',
  creditLimit: 100000,
  currentOutstanding: 25000,
  paymentTerms: 'Net 30',
  isVerified: true,
  isActive: true,
  createdAt: new Date().toISOString(),
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  if (type === 'verify_license') {
    // Verify drug license number
    const licenseNumber = searchParams.get('licenseNumber');
    if (!licenseNumber) {
      return NextResponse.json({ error: 'License number required' }, { status: 400 });
    }

    const pharmacy = Array.from(pharmacies.values()).find(
      p => p.drugLicenseNumber === licenseNumber
    );

    return NextResponse.json({
      success: true,
      data: {
        exists: !!pharmacy,
        verified: pharmacy?.isVerified || false,
        pharmacy: pharmacy ? {
          name: pharmacy.pharmacyName,
          owner: pharmacy.ownerName,
          city: pharmacy.city,
        } : null,
      },
    });
  }

  if (type === 'verify_gst') {
    // Verify GST number
    const gstNumber = searchParams.get('gstNumber');
    if (!gstNumber) {
      return NextResponse.json({ error: 'GST number required' }, { status: 400 });
    }

    const pharmacy = Array.from(pharmacies.values()).find(
      p => p.gstNumber === gstNumber
    );

    return NextResponse.json({
      success: true,
      data: {
        exists: !!pharmacy,
        valid: true, // In production, verify against GST portal
      },
    });
  }

  // Return all verified pharmacies
  return NextResponse.json({
    success: true,
    data: Array.from(pharmacies.values()).filter(p => p.isVerified && p.isActive),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...data } = body;

    if (action === 'register') {
      // Check if drug license exists
      const existingLicense = Array.from(pharmacies.values()).find(
        p => p.drugLicenseNumber === data.drugLicenseNumber
      );
      if (existingLicense) {
        return NextResponse.json({ 
          error: 'Drug license already registered',
          verified: existingLicense.isVerified,
        }, { status: 400 });
      }

      // Check if GST exists
      const existingGst = Array.from(pharmacies.values()).find(
        p => p.gstNumber === data.gstNumber
      );
      if (existingGst) {
        return NextResponse.json({ error: 'GST number already registered' }, { status: 400 });
      }

      const id = generateId('pharmacy');

      const pharmacy = {
        id,
        email: data.email,
        pharmacyName: data.pharmacyName,
        ownerName: data.ownerName,
        drugLicenseNumber: data.drugLicenseNumber,
        drugLicenseExpiry: data.drugLicenseExpiry,
        gstNumber: data.gstNumber,
        address: data.address,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        phone: data.phone,
        creditLimit: data.creditLimit || 50000,
        currentOutstanding: 0,
        paymentTerms: data.paymentTerms || 'Net 30',
        isVerified: false, // Requires admin approval
        isActive: true,
        createdAt: new Date().toISOString(),
      };

      pharmacies.set(id, pharmacy);

      return NextResponse.json({
        success: true,
        data: {
          message: 'Registration submitted for verification',
        },
      }, { status: 201 });
    }

    if (action === 'login') {
      const pharmacy = Array.from(pharmacies.values()).find(
        p => p.email === data.email
      );

      if (!pharmacy) {
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
      }

      if (!pharmacy.isActive) {
        return NextResponse.json({ error: 'Account is deactivated' }, { status: 403 });
      }

      const token = Buffer.from(JSON.stringify({ 
        userId: pharmacy.id, 
        role: 'pharmacy' 
      })).toString('base64');

      return NextResponse.json({
        success: true,
        user: { ...pharmacy },
        token,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Pharmacy error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  const role = request.headers.get('x-user-role');

  // Only pharmacies or admin can update
  if (role !== 'pharmacy' && role !== 'admin' && role !== 'superadmin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { pharmacyId, isVerified, isActive, creditLimit, paymentTerms } = body;

    // Find pharmacy
    let targetPharmacy: any = null;
    
    if (role === 'pharmacy' && userId) {
      // Pharmacies can only update themselves
      targetPharmacy = pharmacies.get(userId);
    } else {
      // Admin can update any pharmacy
      targetPharmacy = pharmacies.get(pharmacyId);
    }

    if (!targetPharmacy) {
      return NextResponse.json({ error: 'Pharmacy not found' }, { status: 404 });
    }

    // Admin can verify, deactivate, or update credit
    if (role === 'admin' || role === 'superadmin') {
      if (typeof isVerified === 'boolean') {
        targetPharmacy.isVerified = isVerified;
      }
      if (typeof isActive === 'boolean') {
        targetPharmacy.isActive = isActive;
      }
      if (creditLimit) {
        targetPharmacy.creditLimit = creditLimit;
      }
      if (paymentTerms) {
        targetPharmacy.paymentTerms = paymentTerms;
      }
    }

    pharmacies.set(targetPharmacy.id, targetPharmacy);

    return NextResponse.json({
      success: true,
      data: targetPharmacy,
    });
  } catch (error) {
    console.error('Pharmacy update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
