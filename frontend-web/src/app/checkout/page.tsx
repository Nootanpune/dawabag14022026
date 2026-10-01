'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { ADDRESSES_QUERY_KEY, fetchAddresses } from '@/lib/addresses';
import { CART_QUERY_KEY } from '@/lib/cart';
import { buildOrderBody, placeOrder } from '@/lib/checkout';
import { useCart } from '@/hooks/useCart';
import { useAuthStore } from '@/store/authStore';
import Header from '@/components/layout/Header';
import CheckoutStepIndicator from '@/components/checkout/CheckoutStepIndicator';
import AddressStep from '@/components/checkout/AddressStep';
import ReviewStep from '@/components/checkout/ReviewStep';
import PrescriptionStep from '@/components/checkout/PrescriptionStep';
import PaymentStep from '@/components/checkout/PaymentStep';
import OrderConfirmed from '@/components/checkout/OrderConfirmed';
import type { CheckoutStep, PlacedOrder } from '@/components/checkout/types';

// Address → review (C-35 disclosure) → prescription (if needed) → payment
export default function CheckoutPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const customerType = useAuthStore((s) => s.user?.customer_type);
  const { data: cart, isLoading: cartLoading } = useCart();

  const [step, setStep] = useState<CheckoutStep>('address');
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [order, setOrder] = useState<PlacedOrder | null>(null);
  const [placing, setPlacing] = useState(false);

  const { data: addresses, isLoading: addressLoading } = useQuery({
    queryKey: ADDRESSES_QUERY_KEY,
    queryFn: fetchAddresses,
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (!isAuthenticated) router.replace('/auth/login');
  }, [isAuthenticated, router]);

  // Pre-select the default address (server returns it first).
  useEffect(() => {
    if (!selectedAddressId && addresses?.length) setSelectedAddressId(addresses[0].id);
  }, [addresses, selectedAddressId]);

  const address = addresses?.find((a) => a.id === selectedAddressId);
  const previewBody = useMemo(() => (address && cart ? buildOrderBody(address, cart) : null), [address, cart]);

  const submitOrder = async (declaration: boolean) => {
    if (!address || !cart) {
      toast.error('Please select a delivery address');
      return;
    }
    setPlacing(true);
    try {
      const placed: PlacedOrder = await placeOrder(buildOrderBody(address, cart, declaration));
      setOrder(placed);
      // Ordered lines were removed from the server cart.
      queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY });
      setStep(placed.requires_prescription ? 'prescription' : 'payment');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to create order'));
    } finally {
      setPlacing(false);
    }
  };

  const content = () => {
    if (step === 'confirmed' && order) return <OrderConfirmed orderNumber={order.order_number} totalPaise={order.total_paise} shipments={order.shipments} />;
    if (step === 'prescription' && order) return <PrescriptionStep orderId={order.id} onDone={() => setStep('payment')} />;
    if (step === 'payment' && order) return <PaymentStep order={order} onPaid={() => setStep('confirmed')} />;

    if (cartLoading || !cart) {
      return (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      );
    }
    if (cart.items.length === 0) {
      return (
        <div className="card text-center py-10 text-sm text-gray-500">
          Your cart is empty.{' '}
          <Link href="/" className="text-brand-600 font-medium hover:underline">
            Browse medicines
          </Link>
        </div>
      );
    }
    if (cart.items.some((i) => !i.available)) {
      return (
        <div className="card text-center py-10 text-sm text-gray-600">
          Some items in your cart are unavailable.{' '}
          <Link href="/cart" className="text-brand-600 font-medium hover:underline">
            Review your cart
          </Link>
        </div>
      );
    }
    if (step === 'review' && previewBody) {
      return (
        <ReviewStep
          body={previewBody}
          needsDeclaration={customerType === 'doc_hospital'}
          placing={placing}
          onBack={() => setStep('address')}
          onPlace={submitOrder}
        />
      );
    }
    return (
      <AddressStep
        addresses={addresses}
        loading={addressLoading}
        selectedId={selectedAddressId}
        onSelect={setSelectedAddressId}
        cart={cart}
        onContinue={() => setStep('review')}
      />
    );
  };

  const showPrescription = order ? order.requires_prescription : !!cart?.requires_prescription;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-8">
        {step !== 'confirmed' && <CheckoutStepIndicator step={step} showPrescription={showPrescription} />}
        {content()}
      </div>
    </div>
  );
}
