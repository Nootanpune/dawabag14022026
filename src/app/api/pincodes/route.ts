// =====================================================
// DAWABAG - Pincodes API Route
// =====================================================

import { NextRequest, NextResponse } from 'next/server';

// Supported pincodes database
const pincodes = [
  { pincode: '110001', area: 'Connaught Place', city: 'Delhi', state: 'Delhi', deliveryDays: 1, codAvailable: true, deliveryCharge: 0 },
  { pincode: '110002', area: 'Chandni Chowk', city: 'Delhi', state: 'Delhi', deliveryDays: 1, codAvailable: true, deliveryCharge: 0 },
  { pincode: '110003', area: 'Karol Bagh', city: 'Delhi', state: 'Delhi', deliveryDays: 1, codAvailable: true, deliveryCharge: 0 },
  { pincode: '110005', area: 'Paharganj', city: 'Delhi', state: 'Delhi', deliveryDays: 1, codAvailable: true, deliveryCharge: 0 },
  { pincode: '110008', area: 'Rajouri Garden', city: 'Delhi', state: 'Delhi', deliveryDays: 1, codAvailable: true, deliveryCharge: 0 },
  { pincode: '400001', area: 'Fort', city: 'Mumbai', state: 'Maharashtra', deliveryDays: 1, codAvailable: true, deliveryCharge: 0 },
  { pincode: '400002', area: 'Nariman Point', city: 'Mumbai', state: 'Maharashtra', deliveryDays: 1, codAvailable: true, deliveryCharge: 0 },
  { pincode: '400003', area: 'Marine Lines', city: 'Mumbai', state: 'Maharashtra', deliveryDays: 1, codAvailable: true, deliveryCharge: 0 },
  { pincode: '400005', area: 'Lower Parel', city: 'Mumbai', state: 'Maharashtra', deliveryDays: 1, codAvailable: true, deliveryCharge: 0 },
  { pincode: '400020', area: 'Andheri East', city: 'Mumbai', state: 'Maharashtra', deliveryDays: 1, codAvailable: true, deliveryCharge: 0 },
  { pincode: '400051', area: 'Bandra West', city: 'Mumbai', state: 'Maharashtra', deliveryDays: 1, codAvailable: true, deliveryCharge: 0 },
  { pincode: '400059', area: 'Goregaon', city: 'Mumbai', state: 'Maharashtra', deliveryDays: 1, codAvailable: true, deliveryCharge: 0 },
  { pincode: '560001', area: 'MG Road', city: 'Bangalore', state: 'Karnataka', deliveryDays: 2, codAvailable: true, deliveryCharge: 50 },
  { pincode: '560002', area: 'Brigade Road', city: 'Bangalore', state: 'Karnataka', deliveryDays: 2, codAvailable: true, deliveryCharge: 50 },
  { pincode: '560003', area: 'Richmond Road', city: 'Bangalore', state: 'Karnataka', deliveryDays: 2, codAvailable: true, deliveryCharge: 50 },
  { pincode: '560025', area: 'Whitefield', city: 'Bangalore', state: 'Karnataka', deliveryDays: 2, codAvailable: true, deliveryCharge: 50 },
  { pincode: '560095', area: 'Electronic City', city: 'Bangalore', state: 'Karnataka', deliveryDays: 3, codAvailable: true, deliveryCharge: 50 },
  { pincode: '600001', area: 'Anna Salai', city: 'Chennai', state: 'Tamil Nadu', deliveryDays: 2, codAvailable: true, deliveryCharge: 50 },
  { pincode: '600002', area: 'T Nagar', city: 'Chennai', state: 'Tamil Nadu', deliveryDays: 2, codAvailable: true, deliveryCharge: 50 },
  { pincode: '600003', area: 'Mount Road', city: 'Chennai', state: 'Tamil Nadu', deliveryDays: 2, codAvailable: true, deliveryCharge: 50 },
  { pincode: '600008', area: 'Adyar', city: 'Chennai', state: 'Tamil Nadu', deliveryDays: 2, codAvailable: true, deliveryCharge: 50 },
  { pincode: '700001', area: 'B B D Bag', city: 'Kolkata', state: 'West Bengal', deliveryDays: 2, codAvailable: true, deliveryCharge: 50 },
  { pincode: '700002', area: 'Baghajatin', city: 'Kolkata', state: 'West Bengal', deliveryDays: 2, codAvailable: true, deliveryCharge: 50 },
  { pincode: '700020', area: 'Salt Lake', city: 'Kolkata', state: 'West Bengal', deliveryDays: 2, codAvailable: true, deliveryCharge: 50 },
  { pincode: '500001', area: 'Abids', city: 'Hyderabad', state: 'Telangana', deliveryDays: 2, codAvailable: true, deliveryCharge: 50 },
  { pincode: '500002', area: 'Balkampet', city: 'Hyderabad', state: 'Telangana', deliveryDays: 2, codAvailable: true, deliveryCharge: 50 },
  { pincode: '500003', area: 'Koti', city: 'Hyderabad', state: 'Telangana', deliveryDays: 2, codAvailable: true, deliveryCharge: 50 },
  { pincode: '500004', area: 'Secunderabad', city: 'Hyderabad', state: 'Telangana', deliveryDays: 2, codAvailable: true, deliveryCharge: 50 },
  { pincode: '500016', area: 'Gachibowli', city: 'Hyderabad', state: 'Telangana', deliveryDays: 3, codAvailable: true, deliveryCharge: 50 },
  { pincode: '411001', area: 'Shivajinagar', city: 'Pune', state: 'Maharashtra', deliveryDays: 2, codAvailable: true, deliveryCharge: 50 },
  { pincode: '411002', area: 'Dapodi', city: 'Pune', state: 'Maharashtra', deliveryDays: 2, codAvailable: true, deliveryCharge: 50 },
  { pincode: '411004', area: 'Khadki', city: 'Pune', state: 'Maharashtra', deliveryDays: 2, codAvailable: true, deliveryCharge: 50 },
  { pincode: '411014', area: 'Hadapsar', city: 'Pune', state: 'Maharashtra', deliveryDays: 2, codAvailable: true, deliveryCharge: 50 },
  { pincode: '380001', area: 'CG Road', city: 'Ahmedabad', state: 'Gujarat', deliveryDays: 2, codAvailable: true, deliveryCharge: 50 },
  { pincode: '380009', area: 'Navrangpura', city: 'Ahmedabad', state: 'Gujarat', deliveryDays: 2, codAvailable: true, deliveryCharge: 50 },
  { pincode: '380015', area: 'Satellite', city: 'Ahmedabad', state: 'Gujarat', deliveryDays: 2, codAvailable: true, deliveryCharge: 50 },
  { pincode: '302001', area: 'MI Road', city: 'Jaipur', state: 'Rajasthan', deliveryDays: 3, codAvailable: true, deliveryCharge: 75 },
  { pincode: '302016', area: 'Vaishali Nagar', city: 'Jaipur', state: 'Rajasthan', deliveryDays: 3, codAvailable: true, deliveryCharge: 75 },
  { pincode: '452001', area: 'South Tukoganj', city: 'Indore', state: 'Madhya Pradesh', deliveryDays: 3, codAvailable: true, deliveryCharge: 75 },
  { pincode: '452010', area: 'Vijay Nagar', city: 'Indore', state: 'Madhya Pradesh', deliveryDays: 3, codAvailable: true, deliveryCharge: 75 },
];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const pincode = searchParams.get('pincode');

  if (pincode) {
    // Check specific pincode
    const result = pincodes.find(p => p.pincode === pincode);
    
    if (result) {
      return NextResponse.json({
        success: true,
        data: {
          available: true,
          ...result,
        },
      });
    } else {
      return NextResponse.json({
        success: true,
        data: {
          available: false,
          message: 'Delivery not available to this pincode',
        },
      });
    }
  }

  // Return all pincodes
  return NextResponse.json({
    success: true,
    data: pincodes,
  });
}

export async function POST(request: NextRequest) {
  // Add new pincode (admin only in production)
  try {
    const body = await request.json();
    const { pincode, area, city, state, deliveryDays, codAvailable, deliveryCharge } = body;

    if (!pincode || !area || !city || !state) {
      return NextResponse.json({ error: 'Pincode, area, city and state are required' }, { status: 400 });
    }

    // Check if already exists
    const exists = pincodes.find(p => p.pincode === pincode);
    if (exists) {
      return NextResponse.json({ error: 'Pincode already exists' }, { status: 400 });
    }

    const newPincode = {
      pincode,
      area,
      city,
      state,
      deliveryDays: deliveryDays || 3,
      codAvailable: codAvailable !== false,
      deliveryCharge: deliveryCharge || 50,
    };

    pincodes.push(newPincode);

    return NextResponse.json({
      success: true,
      data: newPincode,
    }, { status: 201 });
  } catch (error) {
    console.error('Pincode error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
