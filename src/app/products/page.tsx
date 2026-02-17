// =====================================================
// DAWABAG - Products Listing Page
// =====================================================

"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import Button from '@/components/ui/Button';
import { Medicine } from '@/types';

const categories = [
  'All',
  'Pain Relief',
  'Antibiotics',
  'Diabetes',
  'Allergy',
  'Acidity',
  'Vitamins',
  'Skin Care',
  'Heart Care',
  'Eye Care',
  'Digestive Health',
  'Respiratory',
  'Mental Health',
];

const manufacturers = [
  'All',
  'Micro Labs Ltd',
  'Alembic Ltd',
  'USV Ltd',
  'Glenmark',
  "Dr. Reddy's",
  'Cipla',
  'Sun Pharma',
  'Abbott',
  'Mankind',
];

export default function ProductsPage() {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [filteredMedicines, setFilteredMedicines] = useState<Medicine[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedManufacturer, setSelectedManufacturer] = useState('All');
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 500]);
  const [sortBy, setSortBy] = useState('name');
  const [showFilters, setShowFilters] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [cart, setCart] = useState<{ items: { medicineId: string; quantity: number; price: number }[] } | null>(null);

  // Sample medicines data
  const sampleMedicines: Medicine[] = [
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
      images: ['/images/dolo650.jpg'],
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
      images: ['/images/azithral.jpg'],
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
      images: ['/images/glycomet.jpg'],
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
      images: ['/images/cetzine.jpg'],
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
      images: ['/images/omez.jpg'],
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'med_006',
      sku: 'SKU006',
      name: 'Combiflam',
      genericName: 'Ibuprofen + Paracetamol',
      brandName: 'Combiflam',
      saltComposition: 'Ibuprofen 400mg + Paracetamol 325mg',
      manufacturer: 'Sun Pharma',
      description: 'Pain reliever for headaches, body pain',
      usage: 'Take as directed',
      storageInstructions: 'Store in cool, dry place',
      category: 'Pain Relief',
      dosageForm: 'tablet',
      strength: '400mg+325mg',
      packSize: 20,
      unit: 'tablets',
      mrp: 45,
      offerPrice: 35,
      discount: 22,
      stock: 90,
      minStockLevel: 25,
      reorderLevel: 15,
      requiresPrescription: false,
      isScheduledDrug: false,
      images: ['/images/combiflam.jpg'],
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'med_007',
      sku: 'SKU007',
      name: 'Neurobion Forte',
      genericName: 'Vitamin B Complex',
      brandName: 'Neurobion',
      saltComposition: 'B1+B6+B12',
      manufacturer: 'Abbott',
      description: 'Vitamin B supplement for nerve health',
      usage: 'Take once daily',
      storageInstructions: 'Store below 25°C',
      category: 'Vitamins',
      dosageForm: 'tablet',
      strength: '100mg',
      packSize: 30,
      unit: 'tablets',
      mrp: 180,
      offerPrice: 145,
      discount: 19,
      stock: 45,
      minStockLevel: 15,
      reorderLevel: 10,
      requiresPrescription: false,
      isScheduledDrug: false,
      images: ['/images/neurobion.jpg'],
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'med_008',
      sku: 'SKU008',
      name: 'Cremaffin',
      genericName: 'Milk of Magnesia',
      brandName: 'Cremaffin',
      saltComposition: 'Magnesium Hydroxide + Liquid Paraffin',
      manufacturer: 'Cipla',
      description: 'Laxative for constipation',
      usage: 'Take at bedtime',
      storageInstructions: 'Store in cool place',
      category: 'Digestive Health',
      dosageForm: 'syrup',
      strength: '60ml',
      packSize: 1,
      unit: 'bottle',
      mrp: 120,
      offerPrice: 95,
      discount: 21,
      stock: 35,
      minStockLevel: 10,
      reorderLevel: 5,
      requiresPrescription: false,
      isScheduledDrug: false,
      images: ['/images/cremaffin.jpg'],
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as Medicine,
  ];

  useEffect(() => {
    setMedicines(sampleMedicines);
    setFilteredMedicines(sampleMedicines);

    const savedCart = localStorage.getItem('dawabag_cart');
    if (savedCart) {
      setCart(JSON.parse(savedCart));
    }
  }, []);

  useEffect(() => {
    let filtered = [...medicines];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        med =>
          med.name.toLowerCase().includes(query) ||
          med.genericName.toLowerCase().includes(query) ||
          med.brandName.toLowerCase().includes(query) ||
          med.saltComposition.toLowerCase().includes(query)
      );
    }

    // Category filter
    if (selectedCategory !== 'All') {
      filtered = filtered.filter(med => med.category === selectedCategory);
    }

    // Manufacturer filter
    if (selectedManufacturer !== 'All') {
      filtered = filtered.filter(med => med.manufacturer === selectedManufacturer);
    }

    // Price filter
    filtered = filtered.filter(
      med => med.offerPrice >= priceRange[0] && med.offerPrice <= priceRange[1]
    );

    // Sort
    if (sortBy === 'price-low') {
      filtered.sort((a, b) => a.offerPrice - b.offerPrice);
    } else if (sortBy === 'price-high') {
      filtered.sort((a, b) => b.offerPrice - a.offerPrice);
    } else if (sortBy === 'discount') {
      filtered.sort((a, b) => b.discount - a.discount);
    } else {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    }

    setFilteredMedicines(filtered);
  }, [searchQuery, selectedCategory, selectedManufacturer, priceRange, sortBy, medicines]);

  const addToCart = (medicine: Medicine) => {
    const qty = quantities[medicine.id] || 1;
    
    const newItem = cart
      ? {
          ...cart,
          items: [
            ...cart.items,
            {
              medicineId: medicine.id,
              quantity: qty,
              price: medicine.offerPrice,
            },
          ],
        }
      : {
          items: [
            {
              medicineId: medicine.id,
              quantity: qty,
              price: medicine.offerPrice,
            },
          ],
        };

    const subtotal = newItem.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const shippingCharges = subtotal >= 500 ? 0 : 49;
    const total = subtotal + shippingCharges;

    const updatedCart = {
      ...newItem,
      subtotal,
      discount: 0,
      shippingCharges,
      total,
    };

    setCart(updatedCart);
    localStorage.setItem('dawabag_cart', JSON.stringify(updatedCart));
    alert(`${medicine.name} added to cart!`);
  };

  const updateQuantity = (medicineId: string, delta: number) => {
    setQuantities(prev => {
      const current = prev[medicineId] || 1;
      const newQty = Math.max(1, current + delta);
      return { ...prev, [medicineId]: newQty };
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">All Medicines</h1>
          <p className="text-gray-500">{filteredMedicines.length} products found</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Filters Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm p-6 sticky top-24">
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-semibold text-gray-900">Filters</h2>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="lg:hidden text-teal-600"
                >
                  {showFilters ? 'Hide' : 'Show'}
                </button>
              </div>

              {/* Search */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
                <input
                  type="text"
                  placeholder="Search medicines..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {/* Category */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Manufacturer */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Manufacturer</label>
                <select
                  value={selectedManufacturer}
                  onChange={(e) => setSelectedManufacturer(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  {manufacturers.map(mfr => (
                    <option key={mfr} value={mfr}>{mfr}</option>
                  ))}
                </select>
              </div>

              {/* Price Range */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Price Range</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    value={priceRange[0]}
                    onChange={(e) => setPriceRange([Number(e.target.value), priceRange[1]])}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="Min"
                  />
                  <span className="text-gray-400">-</span>
                  <input
                    type="number"
                    value={priceRange[1]}
                    onChange={(e) => setPriceRange([priceRange[0], Number(e.target.value)])}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="Max"
                  />
                </div>
              </div>

              <Button
                variant="outline"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('All');
                  setSelectedManufacturer('All');
                  setPriceRange([0, 500]);
                }}
                className="w-full"
              >
                Clear Filters
              </Button>
            </div>
          </div>

          {/* Products Grid */}
          <div className="lg:col-span-3">
            {/* Sort */}
            <div className="flex justify-between items-center mb-4">
              <p className="text-gray-500">{filteredMedicines.length} products</p>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="name">Sort by Name</option>
                <option value="price-low">Price: Low to High</option>
                <option value="price-high">Price: High to Low</option>
                <option value="discount">Discount: High to Low</option>
              </select>
            </div>

            {/* Products */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredMedicines.map((medicine) => (
                <div key={medicine.id} className="bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                  {/* Medicine Image */}
                  <div className="h-40 bg-gray-100 flex items-center justify-center">
                    <span className="text-4xl">💊</span>
                  </div>

                  <div className="p-4">
                    <p className="text-xs text-gray-500">{medicine.manufacturer}</p>
                    <h3 className="font-semibold text-gray-900 mt-1">{medicine.name}</h3>
                    <p className="text-sm text-gray-500">{medicine.strength} - {medicine.packSize} {medicine.unit}</p>

                    {medicine.requiresPrescription && (
                      <span className="inline-block mt-2 px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded">
                        Prescription Required
                      </span>
                    )}

                    <div className="flex items-center mt-3">
                      <span className="text-lg font-bold text-gray-900">₹{medicine.offerPrice}</span>
                      <span className="ml-2 text-sm text-gray-400 line-through">₹{medicine.mrp}</span>
                      <span className="ml-2 text-sm text-green-600">{medicine.discount}% off</span>
                    </div>

                    {/* Quantity Selector */}
                    <div className="flex items-center mt-3">
                      <div className="flex items-center border rounded">
                        <button
                          onClick={() => updateQuantity(medicine.id, -1)}
                          className="px-3 py-1 text-gray-600"
                        >
                          -
                        </button>
                        <span className="px-3 py-1">{quantities[medicine.id] || 1}</span>
                        <button
                          onClick={() => updateQuantity(medicine.id, 1)}
                          className="px-3 py-1 text-gray-600"
                        >
                          +
                        </button>
                      </div>
                      <Button
                        onClick={() => addToCart(medicine)}
                        className="ml-auto"
                        size="sm"
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {filteredMedicines.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500">No medicines found matching your criteria.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
