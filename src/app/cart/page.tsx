// =====================================================
// DAWABAG - Shopping Cart Page
// =====================================================

"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Medicine, Cart as CartType, CartItem } from '@/types';

export default function CartPage() {
  const router = useRouter();
  const [cart, setCart] = useState<CartType | null>(null);
  const [medicines, setMedicines] = useState<Record<string, Medicine>>({});
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [couponError, setCouponError] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Sample medicines data (in production, this would come from API)
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
  ];

  useEffect(() => {
    // Build medicines lookup
    const medicineMap: Record<string, Medicine> = {};
    sampleMedicines.forEach(med => {
      medicineMap[med.id] = med;
    });
    setMedicines(medicineMap);

    // Load cart
    const savedCart = localStorage.getItem('dawabag_cart');
    if (savedCart) {
      setCart(JSON.parse(savedCart));
    }

    // Check auth
    const savedUser = localStorage.getItem('dawabag_user');
    if (savedUser) {
      setIsLoggedIn(true);
    }
  }, []);

  const updateQuantity = (medicineId: string, delta: number) => {
    if (!cart) return;

    const updatedItems = cart.items.map(item => {
      if (item.medicineId === medicineId) {
        const newQty = Math.max(1, item.quantity + delta);
        const medicine = medicines[medicineId];
        if (medicine && newQty > medicine.stock) return item;
        return { ...item, quantity: newQty };
      }
      return item;
    });

    const subtotal = updatedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const discount = appliedCoupon ? (subtotal * appliedCoupon.discount / 100) : 0;
    const shippingCharges = subtotal >= 500 ? 0 : 49;
    const total = subtotal - discount + shippingCharges;

    const updatedCart = {
      ...cart,
      items: updatedItems,
      subtotal,
      discount,
      shippingCharges,
      total,
      couponCode: appliedCoupon?.code,
      updatedAt: new Date().toISOString(),
    };

    setCart(updatedCart);
    localStorage.setItem('dawabag_cart', JSON.stringify(updatedCart));
  };

  const removeItem = (medicineId: string) => {
    if (!cart) return;

    const updatedItems = cart.items.filter(item => item.medicineId !== medicineId);
    const subtotal = updatedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const discount = appliedCoupon ? (subtotal * appliedCoupon.discount / 100) : 0;
    const shippingCharges = subtotal >= 500 ? 0 : 49;
    const total = subtotal - discount + shippingCharges;

    const updatedCart = {
      ...cart,
      items: updatedItems,
      subtotal,
      discount,
      shippingCharges,
      total,
      updatedAt: new Date().toISOString(),
    };

    setCart(updatedCart);
    localStorage.setItem('dawabag_cart', JSON.stringify(updatedCart));
  };

  const applyCoupon = () => {
    setCouponError('');
    // Simulate coupon validation
    if (couponCode.toUpperCase() === 'HEALTH20') {
      setAppliedCoupon({ code: 'HEALTH20', discount: 20 });
      // Recalculate total
      if (cart) {
        const subtotal = cart.subtotal;
        const discount = subtotal * 0.2;
        const shippingCharges = subtotal >= 500 ? 0 : 49;
        const total = subtotal - discount + shippingCharges;
        
        const updatedCart = {
          ...cart,
          discount,
          total,
          couponCode: 'HEALTH20',
          updatedAt: new Date().toISOString(),
        };
        setCart(updatedCart);
        localStorage.setItem('dawabag_cart', JSON.stringify(updatedCart));
      }
    } else {
      setCouponError('Invalid coupon code');
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode('');
    if (cart) {
      const subtotal = cart.subtotal;
      const shippingCharges = subtotal >= 500 ? 0 : 49;
      const total = subtotal + shippingCharges;
      
      const updatedCart = {
        ...cart,
        discount: 0,
        total,
        couponCode: undefined,
        updatedAt: new Date().toISOString(),
      };
      setCart(updatedCart);
      localStorage.setItem('dawabag_cart', JSON.stringify(updatedCart));
    }
  };

  const getMedicine = (id: string) => medicines[id];

  if (!cart || cart.items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center">
            <svg className="mx-auto h-16 w-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <h2 className="mt-4 text-xl font-medium text-gray-900">Your cart is empty</h2>
            <p className="mt-2 text-gray-500">Looks like you haven't added any medicines to your cart yet.</p>
            <Link href="/">
              <Button className="mt-6">Continue Shopping</Button>
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-8">Shopping Cart ({cart.items.length} items)</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Cart Items */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              {cart.items.map((item) => {
                const medicine = getMedicine(item.medicineId);
                if (!medicine) return null;

                return (
                  <div key={item.medicineId} className="p-4 border-b last:border-b-0">
                    <div className="flex items-start">
                      {/* Medicine Image Placeholder */}
                      <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center">
                        <span className="text-2xl">💊</span>
                      </div>

                      <div className="ml-4 flex-1">
                        <div className="flex justify-between">
                          <div>
                            <h3 className="font-medium text-gray-900">{medicine.name}</h3>
                            <p className="text-sm text-gray-500">{medicine.strength} - {medicine.packSize} {medicine.unit}</p>
                            <p className="text-xs text-gray-400">{medicine.manufacturer}</p>
                          </div>
                          <p className="font-medium text-gray-900">₹{item.price * item.quantity}</p>
                        </div>

                        {medicine.requiresPrescription && (
                          <div className="mt-2 flex items-center text-amber-600 text-sm">
                            <svg className="h-4 w-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            Prescription Required
                          </div>
                        )}

                        <div className="mt-3 flex items-center justify-between">
                          <div className="flex items-center border rounded-lg">
                            <button
                              onClick={() => updateQuantity(item.medicineId, -1)}
                              className="px-3 py-1 text-gray-600 hover:text-gray-900"
                            >
                              -
                            </button>
                            <span className="px-3 py-1 text-gray-900">{item.quantity}</span>
                            <button
                              onClick={() => updateQuantity(item.medicineId, 1)}
                              className="px-3 py-1 text-gray-600 hover:text-gray-900"
                            >
                              +
                            </button>
                          </div>

                          <button
                            onClick={() => removeItem(item.medicineId)}
                            className="text-red-600 hover:text-red-700 text-sm"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4">
              <Link href="/" className="text-teal-600 hover:text-teal-700 text-sm font-medium">
                ← Continue Shopping
              </Link>
            </div>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm p-6 sticky top-24">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Order Summary</h2>

              {/* Coupon Code */}
              <div className="mb-4">
                {appliedCoupon ? (
                  <div className="flex items-center justify-between bg-green-50 p-3 rounded-lg">
                    <div>
                      <span className="text-green-700 font-medium">{appliedCoupon.code}</span>
                      <span className="text-green-600 text-sm ml-2">({appliedCoupon.discount}% off)</span>
                    </div>
                    <button
                      onClick={removeCoupon}
                      className="text-green-700 hover:text-green-900"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <div className="flex">
                    <input
                      type="text"
                      placeholder="Enter coupon code"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-l-lg focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                    <button
                      onClick={applyCoupon}
                      className="px-4 py-2 bg-teal-600 text-white rounded-r-lg hover:bg-teal-700"
                    >
                      Apply
                    </button>
                  </div>
                )}
                {couponError && <p className="text-red-600 text-sm mt-1">{couponError}</p>}
                <p className="text-xs text-gray-500 mt-1">Try: HEALTH20 for 20% off</p>
              </div>

              <div className="border-t pt-4 space-y-3">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>₹{cart.subtotal.toFixed(2)}</span>
                </div>
                
                {appliedCoupon && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount</span>
                    <span>-₹{cart.discount.toFixed(2)}</span>
                  </div>
                )}
                
                <div className="flex justify-between text-gray-600">
                  <span>Shipping</span>
                  <span>{cart.shippingCharges === 0 ? 'Free' : `₹${cart.shippingCharges}`}</span>
                </div>
                
                {cart.subtotal < 500 && (
                  <p className="text-xs text-green-600">Add ₹{(500 - cart.subtotal).toFixed(2)} more for free shipping</p>
                )}

                <div className="border-t pt-3 flex justify-between font-semibold text-lg">
                  <span>Total</span>
                  <span>₹{cart.total.toFixed(2)}</span>
                </div>
              </div>

              <Button
                onClick={() => router.push('/checkout')}
                className="w-full mt-6"
              >
                Proceed to Checkout
              </Button>

              {!isLoggedIn && (
                <p className="text-xs text-gray-500 mt-4 text-center">
                  Please login to complete your purchase
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
