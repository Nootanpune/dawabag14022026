// =====================================================
// DAWABAG - Customer Home Page
// Addressing URS gaps: Search, Pincode, Cart, Login
// =====================================================

"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Medicine, Cart, PincodeService, Order } from '@/types';

// Sample data for demonstration
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
    sideEffects: ['Nausea', 'Metallic taste'],
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
    sideEffects: ['Drowsiness', 'Dry mouth'],
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
    manufacturer: 'Dr. Reddy\'s',
    description: 'Proton pump inhibitor for acidity',
    usage: 'Take before meals',
    sideEffects: ['Headache', 'Nausea'],
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
];

const categories = [
  'All Medicines',
  'Pain Relief',
  'Antibiotics',
  'Diabetes',
  'Allergy',
  'Acidity',
  'Vitamins',
  'Skin Care',
  'Heart Care',
  'Eye Care',
];

export default function HomePage() {
  // State for search and filters
  const [searchQuery, setSearchQuery] = useState('');
  const [pincode, setPincode] = useState('');
  const [pincodeService, setPincodeService] = useState<PincodeService | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('All Medicines');
  const [medicines, setMedicines] = useState<Medicine[]>(sampleMedicines);
  const [filteredMedicines, setFilteredMedicines] = useState<Medicine[]>(sampleMedicines);
  
  // Cart state
  const [cart, setCart] = useState<Cart | null>(null);
  const [showCart, setShowCart] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  
  // Search filters
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 500]);
  const [showFilters, setShowFilters] = useState(false);
  
  // Cart modal quantity state
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  // Initialize cart from localStorage
  useEffect(() => {
    const savedCart = localStorage.getItem('dawabag_cart');
    if (savedCart) {
      setCart(JSON.parse(savedCart));
    }
    
    const savedPincode = localStorage.getItem('dawabag_pincode');
    if (savedPincode) {
      setPincode(savedPincode);
      // Simulate pincode service check
      checkPincodeService(savedPincode);
    }
  }, []);

  // Filter medicines when search query or category changes
  useEffect(() => {
    let filtered = medicines;
    
    // Filter by search query (brand name or generic name)
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
    
    // Filter by category
    if (selectedCategory !== 'All Medicines') {
      filtered = filtered.filter(med => med.category === selectedCategory);
    }
    
    // Filter by price range
    filtered = filtered.filter(
      med => med.offerPrice >= priceRange[0] && med.offerPrice <= priceRange[1]
    );
    
    setFilteredMedicines(filtered);
  }, [searchQuery, selectedCategory, priceRange, medicines]);

  // Simulate pincode service check
  const checkPincodeService = (code: string) => {
    // In production, this would be an API call
    if (code.length === 6) {
      setPincodeService({
        id: 'pcs_001',
        pincode: code,
        area: 'Sample Area',
        city: 'Mumbai',
        state: 'Maharashtra',
        isDeliverable: true,
        deliveryDays: 3,
        deliveryCharges: 49,
        codAvailable: false,
        expressDelivery: true,
        expressCharges: 99,
        updatedAt: new Date().toISOString(),
      });
    }
  };

  const handlePincodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pincode.length === 6) {
      localStorage.setItem('dawabag_pincode', pincode);
      checkPincodeService(pincode);
    }
  };

  const addToCart = (medicine: Medicine) => {
    const qty = quantities[medicine.id] || 1;
    
    const newItem: Cart = cart
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
          subtotal: cart.subtotal + medicine.offerPrice * qty,
          total: cart.subtotal + medicine.offerPrice * qty,
          updatedAt: new Date().toISOString(),
        }
      : {
          id: 'cart_' + Date.now(),
          customerId: '',
          items: [
            {
              medicineId: medicine.id,
              quantity: qty,
              price: medicine.offerPrice,
            },
          ],
          subtotal: medicine.offerPrice * qty,
          discount: 0,
          shippingCharges: 0,
          total: medicine.offerPrice * qty,
          updatedAt: new Date().toISOString(),
        };

    setCart(newItem);
    localStorage.setItem('dawabag_cart', JSON.stringify(newItem));
    setShowCart(true);
  };

  const updateQuantity = (medicineId: string, delta: number) => {
    setQuantities(prev => {
      const current = prev[medicineId] || 1;
      const newQty = Math.max(1, current + delta);
      return { ...prev, [medicineId]: newQty };
    });
  };

  const getCartCount = () => {
    if (!cart) return 0;
    return cart.items.reduce((sum, item) => sum + item.quantity, 0);
  };

  const handleLogin = () => {
    setShowAuthModal(false);
    setIsLoggedIn(true);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center">
              <span className="text-2xl font-bold text-teal-600">Dawabag</span>
            </Link>

            {/* Search Bar */}
            <div className="flex-1 max-w-2xl mx-8">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search medicines by brand, generic name or salt..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
                <svg
                  className="absolute left-3 top-2.5 h-5 w-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
            </div>

            {/* Pincode Selector */}
            <form onSubmit={handlePincodeSubmit} className="flex items-center">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Enter PIN"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-24 px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-teal-500"
                />
              </div>
              {pincodeService && (
                <span className="ml-2 text-xs text-green-600 font-medium">
                  {pincodeService.deliveryDays} days
                </span>
              )}
            </form>

            {/* Auth & Cart */}
            <div className="flex items-center space-x-4">
              {isLoggedIn ? (
                <Link href="/customer/profile" className="text-gray-700 hover:text-teal-600">
                  My Account
                </Link>
              ) : (
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="text-gray-700 hover:text-teal-600"
                >
                  Login / Sign Up
                </button>
              )}
              
              {/* Cart Button */}
              <button
                onClick={() => setShowCart(true)}
                className="relative p-2 text-gray-700 hover:text-teal-600"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
                {getCartCount() > 0 && (
                  <span className="absolute -top-1 -right-1 bg-teal-600 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                    {getCartCount()}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Category Navigation */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center space-x-8 py-3 overflow-x-auto">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`whitespace-nowrap text-sm font-medium ${
                  selectedCategory === category
                    ? 'text-teal-600 border-b-2 border-teal-600'
                    : 'text-gray-600 hover:text-teal-600'
                }`}
              >
                {category}
              </button>
            ))}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="whitespace-nowrap text-sm font-medium text-gray-600 hover:text-teal-600 flex items-center"
            >
              <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              Filters
            </button>
          </div>
        </div>
      </nav>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-white border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Price Range</h3>
            <div className="flex items-center space-x-4">
              <input
                type="number"
                value={priceRange[0]}
                onChange={(e) => setPriceRange([Number(e.target.value), priceRange[1]])}
                className="w-24 px-3 py-2 border border-gray-300 rounded"
                placeholder="Min"
              />
              <span className="text-gray-500">to</span>
              <input
                type="number"
                value={priceRange[1]}
                onChange={(e) => setPriceRange([priceRange[0], Number(e.target.value)])}
                className="w-24 px-3 py-2 border border-gray-300 rounded"
                placeholder="Max"
              />
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Banner */}
        <div className="bg-gradient-to-r from-teal-500 to-teal-700 rounded-xl p-8 mb-8 text-white">
          <h1 className="text-3xl font-bold mb-2">Quick & Reliable Medicine Delivery</h1>
          <p className="text-teal-100 mb-4">Upload your prescription and get medicines delivered to your door</p>
          <div className="flex items-center space-x-4">
            <span className="flex items-center">
              <svg className="h-5 w-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Genuine Medicines
            </span>
            <span className="flex items-center">
              <svg className="h-5 w-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Fast Delivery
            </span>
            <span className="flex items-center">
              <svg className="h-5 w-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Secure Payment
            </span>
          </div>
        </div>

        {/* Medicines Grid */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            {selectedCategory === 'All Medicines' ? 'All Medicines' : selectedCategory}
            <span className="ml-2 text-sm font-normal text-gray-500">({filteredMedicines.length} products)</span>
          </h2>
        </div>

        {filteredMedicines.length === 0 ? (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No medicines found</h3>
            <p className="mt-1 text-sm text-gray-500">Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredMedicines.map((medicine) => (
              <div
                key={medicine.id}
                className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow border border-gray-100"
              >
                {/* Product Image Placeholder */}
                <div className="h-40 bg-gray-100 rounded-t-xl flex items-center justify-center">
                  <svg className="h-16 w-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                </div>

                <div className="p-4">
                  {/* Brand & Generic Name */}
                  <p className="text-xs text-gray-500">{medicine.brandName}</p>
                  <h3 className="font-semibold text-gray-900 text-sm mb-1">{medicine.name}</h3>
                  <p className="text-xs text-gray-500 mb-2">{medicine.genericName}</p>

                  {/* Manufacturer */}
                  <p className="text-xs text-gray-400 mb-2">Mfr: {medicine.manufacturer}</p>

                  {/* Price */}
                  <div className="flex items-baseline space-x-2 mb-3">
                    <span className="text-lg font-bold text-teal-600">₹{medicine.offerPrice}</span>
                    <span className="text-sm text-gray-400 line-through">₹{medicine.mrp}</span>
                    <span className="text-xs text-green-600 font-medium">{medicine.discount}% off</span>
                  </div>

                  {/* Prescription Required Badge */}
                  {medicine.requiresPrescription && (
                    <span className="inline-block px-2 py-1 text-xs font-medium bg-orange-100 text-orange-700 rounded mb-3">
                      Prescription Required
                    </span>
                  )}

                  {/* Stock Status */}
                  {medicine.stock > 0 ? (
                    <span className="inline-block text-xs text-green-600 mb-3">In Stock</span>
                  ) : (
                    <span className="inline-block text-xs text-red-600 mb-3">Out of Stock</span>
                  )}

                  {/* Quantity Selector & Add to Cart */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center border border-gray-300 rounded">
                      <button
                        onClick={() => updateQuantity(medicine.id, -1)}
                        className="px-2 py-1 text-gray-600 hover:bg-gray-100"
                      >
                        -
                      </button>
                      <span className="px-2 py-1 text-sm">{quantities[medicine.id] || 1}</span>
                      <button
                        onClick={() => updateQuantity(medicine.id, 1)}
                        className="px-2 py-1 text-gray-600 hover:bg-gray-100"
                      >
                        +
                      </button>
                    </div>
                    <button
                      onClick={() => addToCart(medicine)}
                      disabled={medicine.stock === 0}
                      className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                      Add to Cart
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Cart Sidebar */}
      {showCart && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => setShowCart(false)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-xl">
            <div className="flex flex-col h-full">
              {/* Cart Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <h2 className="text-lg font-semibold">Shopping Cart</h2>
                <button
                  onClick={() => setShowCart(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Cart Items */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                {!cart || cart.items.length === 0 ? (
                  <div className="text-center py-8">
                    <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <p className="mt-2 text-gray-500">Your cart is empty</p>
                    <button
                      onClick={() => setShowCart(false)}
                      className="mt-4 text-teal-600 hover:text-teal-700"
                    >
                      Continue Shopping
                    </button>
                  </div>
                ) : (
                  <ul className="space-y-4">
                    {cart.items.map((item, index) => {
                      const medicine = medicines.find(m => m.id === item.medicineId);
                      if (!medicine) return null;
                      return (
                        <li key={index} className="flex items-start border-b pb-4">
                          <div className="flex-1">
                            <h3 className="font-medium text-gray-900">{medicine.name}</h3>
                            <p className="text-sm text-gray-500">{medicine.strength} - {medicine.dosageForm}</p>
                            <p className="text-sm text-gray-500">Qty: {item.quantity}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">₹{item.price * item.quantity}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Cart Footer */}
              {cart && cart.items.length > 0 && (
                <div className="border-t px-6 py-4">
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-600">Subtotal</span>
                    <span className="font-semibold">₹{cart.subtotal}</span>
                  </div>
                  <div className="flex justify-between mb-4">
                    <span className="text-gray-600">Shipping</span>
                    <span className="text-sm text-gray-500">
                      {pincodeService ? `₹${pincodeService.deliveryCharges}` : 'Enter PIN'}
                    </span>
                  </div>
                  <div className="flex justify-between mb-4">
                    <span className="text-gray-600">Total</span>
                    <span className="text-lg font-bold text-teal-600">₹{cart.subtotal + (pincodeService?.deliveryCharges || 0)}</span>
                  </div>
                  <Link
                    href={isLoggedIn ? "/customer/checkout" : "/customer/login"}
                    className="block w-full py-3 bg-teal-600 text-white text-center font-medium rounded-lg hover:bg-teal-700"
                  >
                    {isLoggedIn ? 'Proceed to Checkout' : 'Login to Checkout'}
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Auth Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => setShowAuthModal(false)} />
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-xl shadow-xl p-6">
            <h2 className="text-2xl font-bold text-center mb-6">Welcome to Dawabag</h2>
            
            {/* Login Options */}
            <div className="space-y-4">
              <button
                onClick={handleLogin}
                className="w-full flex items-center justify-center px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <svg className="h-5 w-5 mr-3" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </button>
              
              <button
                onClick={handleLogin}
                className="w-full flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <svg className="h-5 w-5 mr-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
                Continue with Facebook
              </button>
            </div>

            <div className="my-6 flex items-center">
              <div className="flex-1 border-t border-gray-300"></div>
              <span className="px-4 text-gray-500 text-sm">or</span>
              <div className="flex-1 border-t border-gray-300"></div>
            </div>

            {/* Email Login */}
            <form onSubmit={(e) => { e.preventDefault(); handleLogin(); }}>
              <div className="space-y-4">
                <input
                  type="tel"
                  placeholder="Mobile Number"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  required
                />
                <button
                  type="submit"
                  className="w-full py-3 bg-teal-600 text-white font-medium rounded-lg hover:bg-teal-700"
                >
                  Send OTP
                </button>
              </div>
            </form>

            <p className="mt-4 text-center text-sm text-gray-500">
              By continuing, you agree to our Terms & Privacy Policy
            </p>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-gray-900 text-white mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <h3 className="text-lg font-semibold mb-4">About Dawabag</h3>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white">About Us</a></li>
                <li><a href="#" className="hover:text-white">Contact Us</a></li>
                <li><a href="#" className="hover:text-white">Careers</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">Services</h3>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white">Online Medicine</a></li>
                <li><a href="#" className="hover:text-white">Doctor Consultation</a></li>
                <li><a href="#" className="hover:text-white">Lab Tests</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">Support</h3>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white">FAQ</a></li>
                <li><a href="#" className="hover:text-white">Help Center</a></li>
                <li><a href="#" className="hover:text-white">Return Policy</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">Contact</h3>
              <ul className="space-y-2 text-gray-400">
                <li>support@dawabag.com</li>
                <li>1800-XXX-XXXX (Toll Free)</li>
                <li>24/7 Customer Support</li>
              </ul>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-gray-800 text-center text-gray-400">
            <p>&copy; 2026 Dawabag. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
