// =====================================================
// DAWABAG - Checkout Page with Prescription Upload
// =====================================================

"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Medicine, Cart, Address, Patient, Prescription, CartItem } from '@/types';
import { generateId, generateOrderNumber } from '@/lib/utils';

export default function CheckoutPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Cart data
  const [cart, setCart] = useState<Cart | null>(null);
  const [medicines, setMedicines] = useState<Record<string, Medicine>>({});
  
  // Addresses
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [newAddress, setNewAddress] = useState<Partial<Address>>({});
  
  // Patients & Prescriptions
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [newPatient, setNewPatient] = useState<{
    name?: string;
    age?: string;
    gender?: string;
    weight?: string;
    height?: string;
    medicalHistory?: string[];
    allergies?: string[];
    chronicConditions?: string[];
  }>({});
  const [prescriptionRequired, setPrescriptionRequired] = useState(false);
  const [prescriptionFiles, setPrescriptionFiles] = useState<File[]>([]);
  
  // Payment
  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'card' | 'netbanking' | 'wallet' | null>(null);

  // Sample medicines
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
      const parsedCart = JSON.parse(savedCart);
      setCart(parsedCart);
      
      // Check if prescription is required for any item
      const requiresRx = parsedCart.items.some((item: CartItem) => {
        const med = medicineMap[item.medicineId];
        return med?.requiresPrescription;
      });
      setPrescriptionRequired(requiresRx);
    }

    // Check auth
    const savedUser = localStorage.getItem('dawabag_user');
    if (savedUser) {
      setIsLoggedIn(true);
      // Load saved addresses
      const savedAddresses = localStorage.getItem('dawabag_addresses');
      if (savedAddresses) {
        setAddresses(JSON.parse(savedAddresses));
      }
      // Load saved patients
      const savedPatients = localStorage.getItem('dawabag_patients');
      if (savedPatients) {
        setPatients(JSON.parse(savedPatients));
      }
    } else {
      // Redirect to login
      router.push('/customer/login?redirect=/checkout');
    }
  }, [router]);

  const handleAddAddress = () => {
    if (!newAddress.name || !newAddress.mobile || !newAddress.addressLine1 || !newAddress.city || !newAddress.pincode) {
      return;
    }

    const address: Address = {
      id: generateId('addr'),
      type: 'shipping',
      name: newAddress.name!,
      mobile: newAddress.mobile!,
      addressLine1: newAddress.addressLine1!,
      addressLine2: newAddress.addressLine2,
      landmark: newAddress.landmark,
      city: newAddress.city!,
      state: newAddress.state || 'Maharashtra',
      pincode: newAddress.pincode!,
      isDefault: addresses.length === 0,
    };

    const updatedAddresses = [...addresses, address];
    setAddresses(updatedAddresses);
    localStorage.setItem('dawabag_addresses', JSON.stringify(updatedAddresses));
    setSelectedAddress(address);
    setShowAddAddress(false);
    setNewAddress({});
  };

  const handleAddPatient = () => {
    if (!newPatient.name || !newPatient.age || !newPatient.gender) {
      return;
    }

    const patient: Patient = {
      id: generateId('pat'),
      customerId: '',
      name: newPatient.name!,
      gender: newPatient.gender as 'male' | 'female' | 'other',
      age: parseInt(newPatient.age as string),
      weight: newPatient.weight ? parseInt(newPatient.weight as string) : undefined,
      height: newPatient.height ? parseInt(newPatient.height as string) : undefined,
      medicalHistory: newPatient.medicalHistory || [],
      allergies: newPatient.allergies || [],
      chronicConditions: newPatient.chronicConditions || [],
      prescriptions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updatedPatients = [...patients, patient];
    setPatients(updatedPatients);
    localStorage.setItem('dawabag_patients', JSON.stringify(updatedPatients));
    setSelectedPatient(patient);
    setShowAddPatient(false);
    setNewPatient({});
  };

  const handlePrescriptionUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setPrescriptionFiles([...prescriptionFiles, ...files]);
    }
  };

  const removePrescription = (index: number) => {
    const updated = prescriptionFiles.filter((_, i) => i !== index);
    setPrescriptionFiles(updated);
  };

  const handlePlaceOrder = async () => {
    if (!selectedAddress || !paymentMethod) return;
    if (prescriptionRequired && prescriptionFiles.length === 0) return;

    setIsLoading(true);

    // Simulate order placement
    setTimeout(() => {
      // Create order
      const order = {
        id: generateId('order'),
        orderNumber: generateOrderNumber(),
        items: cart?.items || [],
        shippingAddress: selectedAddress,
        billingAddress: selectedAddress,
        subtotal: cart?.subtotal || 0,
        discount: cart?.discount || 0,
        couponDiscount: 0,
        referralDiscount: 0,
        shippingCharges: cart?.shippingCharges || 0,
        gstAmount: ((cart?.subtotal || 0) * 0.18),
        total: cart?.total || 0,
        paymentMethod,
        paymentStatus: 'pending',
        orderStatus: 'pending',
        prescriptionStatus: prescriptionRequired ? 'pending' : undefined,
        isRefillOrder: false,
        pincode: selectedAddress.pincode,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Save order
      const savedOrders = localStorage.getItem('dawabag_orders');
      const orders = savedOrders ? JSON.parse(savedOrders) : [];
      orders.push(order);
      localStorage.setItem('dawabag_orders', JSON.stringify(orders));

      // Clear cart
      localStorage.removeItem('dawabag_cart');

      setIsLoading(false);
      router.push(`/checkout/success?order=${order.orderNumber}`);
    }, 2000);
  };

  const getMedicine = (id: string) => medicines[id];

  if (!cart || cart.items.length === 0) {
    router.push('/cart');
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {['Address', 'Prescription', 'Payment'].map((label, index) => (
              <div key={label} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  step > index + 1 ? 'bg-green-500' : step === index + 1 ? 'bg-teal-600' : 'bg-gray-200'
                } text-white font-medium`}>
                  {step > index + 1 ? '✓' : index + 1}
                </div>
                <span className={`ml-2 text-sm font-medium ${step >= index + 1 ? 'text-gray-900' : 'text-gray-400'}`}>
                  {label}
                </span>
                {index < 2 && <div className={`w-16 sm:w-24 h-0.5 mx-4 ${step > index + 1 ? 'bg-green-500' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            {/* Step 1: Address */}
            {step === 1 && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Delivery Address</h2>
                
                {addresses.length > 0 && !showAddAddress && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    {addresses.map((addr) => (
                      <div
                        key={addr.id}
                        onClick={() => setSelectedAddress(addr)}
                        className={`p-4 border rounded-lg cursor-pointer ${
                          selectedAddress?.id === addr.id ? 'border-teal-500 bg-teal-50' : 'border-gray-200'
                        }`}
                      >
                        <p className="font-medium">{addr.name}</p>
                        <p className="text-sm text-gray-600">{addr.addressLine1}</p>
                        {addr.addressLine2 && <p className="text-sm text-gray-600">{addr.addressLine2}</p>}
                        <p className="text-sm text-gray-600">{addr.city}, {addr.pincode}</p>
                        <p className="text-sm text-gray-500">Mobile: {addr.mobile}</p>
                      </div>
                    ))}
                  </div>
                )}

                {showAddAddress ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <Input
                        label="Full Name"
                        placeholder="Enter full name"
                        value={newAddress.name || ''}
                        onChange={(e) => setNewAddress({ ...newAddress, name: e.target.value })}
                      />
                      <Input
                        label="Mobile Number"
                        placeholder="10-digit mobile"
                        value={newAddress.mobile || ''}
                        onChange={(e) => setNewAddress({ ...newAddress, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                      />
                    </div>
                    <Input
                      label="Address Line 1"
                      placeholder="House no., Building name"
                      value={newAddress.addressLine1 || ''}
                      onChange={(e) => setNewAddress({ ...newAddress, addressLine1: e.target.value })}
                    />
                    <Input
                      label="Address Line 2 (Optional)"
                      placeholder="Area, Landmark"
                      value={newAddress.addressLine2 || ''}
                      onChange={(e) => setNewAddress({ ...newAddress, addressLine2: e.target.value })}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <Input
                        label="City"
                        placeholder="City"
                        value={newAddress.city || ''}
                        onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })}
                      />
                      <Input
                        label="PIN Code"
                        placeholder="6-digit PIN"
                        value={newAddress.pincode || ''}
                        onChange={(e) => setNewAddress({ ...newAddress, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                      />
                    </div>
                    <div className="flex space-x-4">
                      <Button onClick={handleAddAddress}>Save Address</Button>
                      <Button variant="outline" onClick={() => setShowAddAddress(false)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAddAddress(true)}
                    className="w-full p-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-teal-500 hover:text-teal-600"
                  >
                    + Add New Address
                  </button>
                )}

                <div className="mt-6 flex justify-end">
                  <Button
                    onClick={() => setStep(2)}
                    disabled={!selectedAddress}
                  >
                    Continue to Prescription
                  </Button>
                </div>
              </div>
            )}

            {/* Step 2: Prescription */}
            {step === 2 && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  {prescriptionRequired ? 'Upload Prescription' : 'Patient Details'}
                </h2>

                {/* Patient Selection */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Select Patient</label>
                  {patients.length > 0 && !showAddPatient ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      {patients.map((patient) => (
                        <div
                          key={patient.id}
                          onClick={() => setSelectedPatient(patient)}
                          className={`p-4 border rounded-lg cursor-pointer ${
                            selectedPatient?.id === patient.id ? 'border-teal-500 bg-teal-50' : 'border-gray-200'
                          }`}
                        >
                          <p className="font-medium">{patient.name}</p>
                          <p className="text-sm text-gray-600">{patient.gender}, {patient.age} years</p>
                        </div>
                      ))}
                      <button
                        onClick={() => setShowAddPatient(true)}
                        className="p-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-teal-500"
                      >
                        + Add Patient
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowAddPatient(true)}
                      className="text-teal-600 hover:text-teal-700 text-sm font-medium"
                    >
                      + Add New Patient
                    </button>
                  )}

                  {showAddPatient && (
                    <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <Input
                          label="Patient Name"
                          placeholder="Enter patient name"
                          value={newPatient.name || ''}
                          onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })}
                        />
                        <Input
                          label="Age"
                          type="number"
                          placeholder="Age"
                          value={newPatient.age || ''}
                          onChange={(e) => setNewPatient({ ...newPatient, age: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                        <select
                          value={newPatient.gender || ''}
                          onChange={(e) => setNewPatient({ ...newPatient, gender: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                        >
                          <option value="">Select gender</option>
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div className="flex space-x-4">
                        <Button onClick={handleAddPatient}>Add Patient</Button>
                        <Button variant="outline" onClick={() => setShowAddPatient(false)}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Prescription Upload */}
                {prescriptionRequired && (
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Upload Prescription <span className="text-red-500">*</span>
                    </label>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                      <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="mt-2 text-sm text-gray-600">Upload prescription image (JPG, PNG, PDF)</p>
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        multiple
                        onChange={handlePrescriptionUpload}
                        className="mt-4 mx-auto block"
                      />
                    </div>

                    {prescriptionFiles.length > 0 && (
                      <div className="mt-4 space-y-2">
                        {prescriptionFiles.map((file, index) => (
                          <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <span className="text-sm text-gray-600">{file.name}</span>
                            <button
                              onClick={() => removePrescription(index)}
                              className="text-red-600 hover:text-red-700"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <p className="mt-2 text-xs text-gray-500">
                      Note: Prescription is valid for 30 days (regular medicines) or 6 months (chronic medicines)
                    </p>
                  </div>
                )}

                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                  <Button
                    onClick={() => setStep(3)}
                    disabled={prescriptionRequired && prescriptionFiles.length === 0}
                  >
                    Continue to Payment
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Payment */}
            {step === 3 && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Payment Method</h2>
                <p className="text-sm text-gray-500 mb-4">Cash on Delivery is not available as per policy</p>

                <div className="space-y-3">
                  {[
                    { id: 'upi', label: 'UPI', icon: '📱' },
                    { id: 'card', label: 'Credit/Debit Card', icon: '💳' },
                    { id: 'netbanking', label: 'Net Banking', icon: '🏦' },
                    { id: 'wallet', label: 'Wallet', icon: '👛' },
                  ].map((method) => (
                    <div
                      key={method.id}
                      onClick={() => setPaymentMethod(method.id as typeof paymentMethod)}
                      className={`p-4 border rounded-lg cursor-pointer flex items-center ${
                        paymentMethod === method.id ? 'border-teal-500 bg-teal-50' : 'border-gray-200'
                      }`}
                    >
                      <span className="text-2xl mr-3">{method.icon}</span>
                      <span className="font-medium">{method.label}</span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between mt-6">
                  <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
                  <Button
                    onClick={handlePlaceOrder}
                    disabled={!paymentMethod}
                    isLoading={isLoading}
                  >
                    Place Order
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Order Summary Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm p-6 sticky top-24">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Order Summary</h2>

              {/* Items */}
              <div className="space-y-4 mb-4">
                {cart.items.map((item) => {
                  const medicine = getMedicine(item.medicineId);
                  if (!medicine) return null;

                  return (
                    <div key={item.medicineId} className="flex justify-between text-sm">
                      <div>
                        <p className="font-medium text-gray-900">{medicine.name}</p>
                        <p className="text-gray-500">{item.quantity} x ₹{item.price}</p>
                      </div>
                      <p className="font-medium">₹{item.price * item.quantity}</p>
                    </div>
                  );
                })}
              </div>

              <div className="border-t pt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotal</span>
                  <span>₹{cart.subtotal.toFixed(2)}</span>
                </div>
                {cart.discount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount</span>
                    <span>-₹{cart.discount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">Shipping</span>
                  <span>{cart.shippingCharges === 0 ? 'Free' : `₹${cart.shippingCharges}`}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">GST (18%)</span>
                  <span>₹{(cart.subtotal * 0.18).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-semibold text-lg pt-2 border-t">
                  <span>Total</span>
                  <span>₹{(cart.total + cart.subtotal * 0.18).toFixed(2)}</span>
                </div>
              </div>

              {selectedAddress && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm font-medium text-gray-700">Delivery to:</p>
                  <p className="text-sm text-gray-600">{selectedAddress.name}</p>
                  <p className="text-sm text-gray-600">{selectedAddress.addressLine1}</p>
                  <p className="text-sm text-gray-600">{selectedAddress.city}, {selectedAddress.pincode}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
