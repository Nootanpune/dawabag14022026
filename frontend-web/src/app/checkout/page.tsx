'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Loader2, MapPin, Upload, CreditCard, CheckCircle2, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { useCartStore } from '@/store/cartStore';
import { formatPrice } from '@/lib/utils';
import Header from '@/components/layout/Header';

type Step = 'address' | 'prescription' | 'payment' | 'confirmed';

declare global { interface Window { Razorpay: any } }

export default function CheckoutPage() {
  const router = useRouter();
  const { items, subtotal, coupon_code, coupon_discount_paise, clearCart, requiresPrescription } = useCartStore();
  const [step, setStep] = useState<Step>('address');
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [prescriptionFile, setPrescriptionFile] = useState<File | null>(null);
  const [savedPrescriptionId, setSavedPrescriptionId] = useState<string | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const pincode = typeof window !== 'undefined' ? localStorage.getItem('dawabag_pincode') || '' : '';

  const { data: addressData, isLoading: addressLoading } = useQuery({
    queryKey: ['addresses'],
    queryFn: async () => { const { data } = await api.get('/users/me/addresses'); return data.data; },
  });

  const { data: rxData } = useQuery({
    queryKey: ['prescriptions'],
    queryFn: async () => { const { data } = await api.get('/prescriptions/my'); return data.data; },
  });

  const sub = subtotal();
  const SHIPPING = 4900;
  const discount = coupon_discount_paise;
  const total = sub + SHIPPING - discount;

  // ── Step 1: Create order then proceed ────────────────────────────────────
  const handleProceedFromAddress = async () => {
    if (!selectedAddress) { toast.error('Please select a delivery address'); return; }
    setIsLoading(true);
    try {
      const { data } = await api.post('/orders', {
        address_id: selectedAddress,
        items: items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
        coupon_code: coupon_code || undefined,
        pincode,
      });
      setCreatedOrderId(data.data.id);
      setOrderNumber(data.data.order_number);
      setStep(requiresPrescription() ? 'prescription' : 'payment');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create order');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Step 2: Upload prescription ──────────────────────────────────────────
  const handleUploadPrescription = async () => {
    if (!prescriptionFile && !savedPrescriptionId) {
      toast.error('Please upload a prescription or select a saved one');
      return;
    }
    if (prescriptionFile && createdOrderId) {
      setIsLoading(true);
      try {
        const form = new FormData();
        form.append('prescription', prescriptionFile);
        form.append('order_id', createdOrderId);
        await api.post('/prescriptions/upload', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        toast.success('Prescription uploaded');
      } catch (err: any) {
        toast.error(err.response?.data?.error || 'Upload failed');
        setIsLoading(false);
        return;
      } finally {
        setIsLoading(false);
      }
    }
    setStep('payment');
  };

  // ── Step 3: Razorpay payment ──────────────────────────────────────────────
  const handlePayment = async () => {
    if (!createdOrderId) return;
    setIsLoading(true);
    try {
      const { data } = await api.post('/payments/create-order', { order_id: createdOrderId });
      const rzpData = data.data;

      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      document.body.appendChild(script);
      script.onload = () => {
        const rzp = new window.Razorpay({
          key: rzpData.razorpay_key_id,
          amount: rzpData.amount,
          currency: 'INR',
          name: 'Dawabag',
          description: `Order ${orderNumber}`,
          order_id: rzpData.razorpay_order_id,
          handler: async (response: any) => {
            try {
              await api.post('/payments/verify', {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                order_id: createdOrderId,
              });
              clearCart();
              setStep('confirmed');
            } catch {
              toast.error('Payment verification failed. Contact support.');
            }
          },
          prefill: {},
          theme: { color: '#1A8856' },
        });
        rzp.open();
        setIsLoading(false);
      };
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Payment initialization failed');
      setIsLoading(false);
    }
  };

  const steps = [
    { key: 'address', label: 'Address', icon: MapPin },
    { key: 'prescription', label: 'Prescription', icon: Upload },
    { key: 'payment', label: 'Payment', icon: CreditCard },
  ];

  const stepIndex = { address: 0, prescription: 1, payment: 2, confirmed: 3 };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* Step indicator */}
        {step !== 'confirmed' && (
          <div className="flex items-center mb-8">
            {steps
              .filter((s) => s.key !== 'prescription' || requiresPrescription())
              .map((s, i, arr) => {
              const done = stepIndex[step] > stepIndex[s.key as Step];
              const active = step === s.key;
              return (
                <div key={s.key} className="flex items-center flex-1">
                  <div className={`flex items-center gap-2 text-sm font-medium
                    ${active ? 'text-brand-600' : done ? 'text-green-600' : 'text-gray-400'}`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs
                      ${active ? 'bg-brand-600 text-white' :
                        done ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                      {done ? '✓' : i + 1}
                    </div>
                    <span className="hidden sm:block">{s.label}</span>
                  </div>
                  {i < arr.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-3 ${done ? 'bg-green-300' : 'bg-gray-200'}`} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Step: Address */}
        {step === 'address' && (
          <div className="card">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-brand-600" /> Delivery address
            </h2>
            {addressLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
            ) : (
              <div className="space-y-3">
                {(addressData || []).map((addr: any) => (
                  <label key={addr.id} className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors
                    ${selectedAddress === addr.id ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input
                      type="radio" name="address" value={addr.id}
                      checked={selectedAddress === addr.id}
                      onChange={() => setSelectedAddress(addr.id)}
                      className="mt-1 accent-brand-600"
                    />
                    <div>
                      <p className="font-medium text-sm">{addr.label} — {addr.full_name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {addr.address_line1}{addr.address_line2 ? `, ${addr.address_line2}` : ''},
                        {' '}{addr.city} — {addr.pincode}, {addr.state}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">Mob: {addr.mobile}</p>
                    </div>
                  </label>
                ))}
                {(!addressData || addressData.length === 0) && (
                  <p className="text-center text-gray-400 py-4 text-sm">No saved addresses. Add one from your account.</p>
                )}
                <button onClick={() => router.push('/account/addresses')}
                  className="w-full border-2 border-dashed border-gray-200 rounded-xl py-3 text-sm text-gray-500 hover:border-brand-300 hover:text-brand-600">
                  + Add new address
                </button>
              </div>
            )}
            <button
              onClick={handleProceedFromAddress}
              disabled={isLoading || !selectedAddress}
              className="btn-primary w-full mt-5 py-3 flex items-center justify-center gap-2"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Step: Prescription */}
        {step === 'prescription' && (
          <div className="card">
            <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
              <Upload className="w-5 h-5 text-brand-600" /> Upload prescription
            </h2>
            <p className="text-sm text-gray-500 mb-5">
              One or more medicines require a valid doctor's prescription.
            </p>

            {/* Upload zone */}
            <label className="block cursor-pointer">
              <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors
                ${prescriptionFile ? 'border-brand-400 bg-brand-50' : 'border-gray-300 hover:border-brand-400 hover:bg-brand-50'}`}>
                {prescriptionFile ? (
                  <>
                    <CheckCircle2 className="w-10 h-10 text-brand-600 mx-auto mb-2" />
                    <p className="font-medium text-sm text-brand-700">{prescriptionFile.name}</p>
                    <p className="text-xs text-brand-500 mt-1">Tap to change</p>
                  </>
                ) : (
                  <>
                    <Upload className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="font-medium text-sm text-gray-600">Upload prescription</p>
                    <p className="text-xs text-gray-400 mt-1">JPEG, PNG or PDF · Max 10 MB</p>
                  </>
                )}
              </div>
              <input type="file" accept="image/*,.pdf" className="hidden"
                onChange={(e) => setPrescriptionFile(e.target.files?.[0] || null)} />
            </label>

            {/* Saved prescriptions */}
            {rxData?.filter((r: any) => r.status === 'verified' && new Date(r.valid_until) > new Date()).length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Or use a saved prescription</p>
                {rxData
                  .filter((r: any) => r.status === 'verified' && new Date(r.valid_until) > new Date())
                  .map((rx: any) => (
                    <button
                      key={rx.id}
                      onClick={() => { setSavedPrescriptionId(rx.id); setPrescriptionFile(null); }}
                      className={`w-full text-left p-3 rounded-xl border-2 transition-colors mb-2
                        ${savedPrescriptionId === rx.id ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-300'}`}
                    >
                      <p className="text-sm font-medium text-brand-700">
                        {rx.doctor_name ? `Dr. ${rx.doctor_name}` : 'Uploaded prescription'}
                      </p>
                      <p className="text-xs text-gray-500">Valid until {new Date(rx.valid_until).toLocaleDateString('en-IN')}</p>
                    </button>
                  ))
                }
              </div>
            )}

            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              Our pharmacist will call to verify your prescription before dispatch.
            </div>

            <button
              onClick={handleUploadPrescription}
              disabled={isLoading || (!prescriptionFile && !savedPrescriptionId)}
              className="btn-primary w-full mt-5 py-3 flex items-center justify-center gap-2"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Continue to payment <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Step: Payment */}
        {step === 'payment' && (
          <div className="card">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-brand-600" /> Payment
            </h2>
            <div className="space-y-2 text-sm mb-6">
              <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatPrice(sub)}</span></div>
              <div className="flex justify-between text-gray-600"><span>Shipping</span><span>{formatPrice(SHIPPING)}</span></div>
              {discount > 0 && (
                <div className="flex justify-between text-green-600"><span>Discount</span><span>–{formatPrice(discount)}</span></div>
              )}
              <div className="border-t border-gray-100 pt-2 flex justify-between font-semibold text-base">
                <span>Total payable</span>
                <span className="text-brand-600">{formatPrice(total)}</span>
              </div>
            </div>
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 mb-5">
              No cash on delivery. Secure payment via Razorpay — UPI, cards, net banking, wallets.
            </div>
            <button
              onClick={handlePayment}
              disabled={isLoading}
              className="btn-primary w-full py-3 flex items-center justify-center gap-2 text-base"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
              Pay {formatPrice(total)} securely
            </button>
          </div>
        )}

        {/* Step: Confirmed */}
        {step === 'confirmed' && (
          <div className="card text-center py-10">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Order confirmed!</h2>
            <p className="text-gray-500 text-sm mb-1">Order ID: <strong>{orderNumber}</strong></p>
            <p className="text-gray-400 text-xs mb-8">
              You'll receive SMS and email updates at every step.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => router.push('/orders')} className="btn-outline">
                Track my order
              </button>
              <button onClick={() => router.push('/')} className="btn-primary">
                Continue shopping
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
