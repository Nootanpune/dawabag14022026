// =====================================================
// DAWABAG - Medicines API Route
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { generateId } from '@/lib/utils';

// Sample medicines data
const medicines = [
  {
    id: 'med_001',
    sku: 'SKU001',
    name: 'Dolo 650',
    genericName: 'Paracetamol',
    brandName: 'Dolo',
    saltComposition: 'Paracetamol 650mg',
    manufacturer: 'Micro Labs Ltd',
    description: 'Pain reliever and fever reducer',
    usage: 'Take as directed by doctor',
    sideEffects: ['Nausea', 'Stomach pain'],
    storageInstructions: 'Store in cool, dry place',
    category: 'Pain Relief',
    dosageForm: 'tablet',
    strength: '650mg',
    packSize: 15,
    unit: 'tablets',
    mrp: 35,
    offerPrice: 28,
    discount: 20,
    stock: 100,
    minStockLevel: 20,
    reorderLevel: 10,
    requiresPrescription: false,
    isScheduledDrug: false,
    isActive: true,
  },
  {
    id: 'med_002',
    sku: 'SKU002',
    name: 'Azithromycin 500mg',
    genericName: 'Azithromycin',
    brandName: 'Azithral',
    saltComposition: 'Azithromycin 500mg',
    manufacturer: 'Alembic Ltd',
    description: 'Antibiotic for bacterial infections',
    usage: 'Take as directed by doctor',
    sideEffects: ['Nausea', 'Diarrhea'],
    storageInstructions: 'Store below 30°C',
    category: 'Antibiotics',
    dosageForm: 'tablet',
    strength: '500mg',
    packSize: 5,
    unit: 'tablets',
    mrp: 120,
    offerPrice: 95,
    discount: 21,
    stock: 50,
    minStockLevel: 15,
    reorderLevel: 8,
    requiresPrescription: true,
    isScheduledDrug: false,
    isActive: true,
  },
  {
    id: 'med_003',
    sku: 'SKU003',
    name: 'Metformin 500mg',
    genericName: 'Metformin Hydrochloride',
    brandName: 'Glycomet',
    saltComposition: 'Metformin 500mg',
    manufacturer: 'USV Ltd',
    description: 'Anti-diabetic medication',
    usage: 'Take with food',
    storageInstructions: 'Store in cool, dry place',
    category: 'Diabetes',
    dosageForm: 'tablet',
    strength: '500mg',
    packSize: 30,
    unit: 'tablets',
    mrp: 75,
    offerPrice: 58,
    discount: 23,
    stock: 80,
    minStockLevel: 25,
    reorderLevel: 15,
    requiresPrescription: true,
    isScheduledDrug: false,
    isActive: true,
  },
  {
    id: 'med_004',
    sku: 'SKU004',
    name: 'Cetirizine 10mg',
    genericName: 'Cetirizine Hydrochloride',
    brandName: 'Cetzine',
    saltComposition: 'Cetirizine 10mg',
    manufacturer: 'Glenmark',
    description: 'Anti-allergic medication',
    usage: 'Take once daily',
    storageInstructions: 'Store below 25°C',
    category: 'Allergy',
    dosageForm: 'tablet',
    strength: '10mg',
    packSize: 10,
    unit: 'tablets',
    mrp: 65,
    offerPrice: 45,
    discount: 31,
    stock: 120,
    minStockLevel: 30,
    reorderLevel: 20,
    requiresPrescription: false,
    isScheduledDrug: false,
    isActive: true,
  },
  {
    id: 'med_005',
    sku: 'SKU005',
    name: 'Omeprazole 20mg',
    genericName: 'Omeprazole',
    brandName: 'Omez',
    saltComposition: 'Omeprazole 20mg',
    manufacturer: "Dr. Reddy's",
    description: 'Proton pump inhibitor for acidity',
    usage: 'Take before meals',
    storageInstructions: 'Store in cool, dry place',
    category: 'Acidity',
    dosageForm: 'capsule',
    strength: '20mg',
    packSize: 15,
    unit: 'capsules',
    mrp: 85,
    offerPrice: 62,
    discount: 27,
    stock: 60,
    minStockLevel: 20,
    reorderLevel: 12,
    requiresPrescription: false,
    isScheduledDrug: false,
    isActive: true,
  },
];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') || '';
  const category = searchParams.get('category');
  const manufacturer = searchParams.get('manufacturer');
  const minPrice = parseFloat(searchParams.get('minPrice') || '0');
  const maxPrice = parseFloat(searchParams.get('maxPrice') || '99999');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');

  let filtered = medicines.filter(m => m.isActive);

  // Search filter
  if (query) {
    const q = query.toLowerCase();
    filtered = filtered.filter(m =>
      m.name.toLowerCase().includes(q) ||
      m.genericName.toLowerCase().includes(q) ||
      m.brandName.toLowerCase().includes(q) ||
      m.saltComposition.toLowerCase().includes(q)
    );
  }

  // Category filter
  if (category && category !== 'All') {
    filtered = filtered.filter(m => m.category === category);
  }

  // Manufacturer filter
  if (manufacturer && manufacturer !== 'All') {
    filtered = filtered.filter(m => m.manufacturer === manufacturer);
  }

  // Price filter
  filtered = filtered.filter(m => m.offerPrice >= minPrice && m.offerPrice <= maxPrice);

  // Pagination
  const start = (page - 1) * limit;
  const paginated = filtered.slice(start, start + limit);

  return NextResponse.json({
    success: true,
    data: paginated,
    pagination: {
      page,
      limit,
      total: filtered.length,
      totalPages: Math.ceil(filtered.length / limit),
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    const required = ['name', 'genericName', 'brandName', 'manufacturer', 'category', 'dosageForm', 'mrp', 'offerPrice'];
    for (const field of required) {
      if (!body[field]) {
        return NextResponse.json({ error: `${field} is required` }, { status: 400 });
      }
    }

    const id = generateId('med');
    const medicine = {
      id,
      sku: body.sku || `SKU${Date.now()}`,
      ...body,
      stock: body.stock || 0,
      minStockLevel: body.minStockLevel || 20,
      reorderLevel: body.reorderLevel || 10,
      discount: body.discount || Math.round((1 - body.offerPrice / body.mrp) * 100),
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    medicines.push(medicine);

    return NextResponse.json({ success: true, data: medicine }, { status: 201 });
  } catch (error) {
    console.error('Error creating medicine:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
