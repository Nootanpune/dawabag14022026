'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { ADDRESSES_QUERY_KEY, fetchAddresses } from '@/lib/addresses';
import { CART_QUERY_KEY } from '@/lib/cart';
import { buildOrderBody, isPrescriptionProblem, placeOrder } from '@/lib/checkout';
import { prescriptionKeys, type MyPrescription } from '@/lib/prescriptions/api';
import { prescriptionKind } from '@/lib/prescriptions/describe';
import { useCart } from '@/hooks/useCart';
import TradePriceBanner from '@/components/shop/TradePriceBanner';
import { useAuthStore } from '@/store/authStore';
import Header from '@/components/layout/Header';
import CheckoutStepIndicator from '@/components/checkout/CheckoutStepIndicator';
import AddressStep from '@/components/checkout/AddressStep';
import ReviewStep from '@/components/checkout/ReviewStep';
import PrescriptionStep from '@/components/checkout/PrescriptionStep';
import PaymentStep from '@/components/checkout/PaymentStep';
import OrderConfirmed from '@/components/checkout/OrderConfirmed';
import type { ChosenRx } from '@/components/checkout/rx/RxAttachedLine';
import type { CheckoutStep, PlacedOrder } from '@/components/checkout/types';

// Address → prescription (if needed, C-08) → review (C-35 disclosure) → place order → payment.
// Sprint 39 (owner decision 2026-10-03): the prescription is sent WITH the order — the server
// refuses a prescription order without one, and payment for it is only authorised until our
// pharmacist's check passes ("You'll only be charged after our pharmacist checks your prescription").
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
  const [rx, setRx] = useState<ChosenRx | null>(null);
  const [rxError, setRxError] = useState('');
  const [paidDemo, setPaidDemo] = useState<{ paidBy?: string } | null>(null); // in memory only: how the trial's demo payment was made
  const [authorised, setAuthorised] = useState(false); // the payment is held until the pharmacist's check (Sprint 39)

  const { data: addresses, isLoading: addressLoading } = useQuery({
    queryKey: ADDRESSES_QUERY_KEY,
    queryFn: fetchAddresses,
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (!isAuthenticated) router.replace('/auth/login?next=/checkout');
  }, [isAuthenticated, router]);

  // Pre-select the default address (server returns it first).
  useEffect(() => {
    if (!selectedAddressId && addresses?.length) setSelectedAddressId(addresses[0].id);
  }, [addresses, selectedAddressId]);

  // Moving between steps starts at the top of the page (phones)
  useEffect(() => { window.scrollTo({ top: 0 }); }, [step]);

  const address = addresses?.find((a) => a.id === selectedAddressId);
  const previewBody = useMemo(() => (address && cart ? buildOrderBody(address, cart) : null), [address, cart]);
  const rxItems = (cart?.items ?? []).filter((i) => i.available && i.requires_prescription).map((i) => ({ name: i.name, quantity: i.quantity }));
  const needsRx = order ? order.requires_prescription : rxItems.length > 0;
  const chooseRx = useCallback((p: MyPrescription) => { setRx({ id: p.id, created_at: p.created_at, kind: prescriptionKind(p) }); setRxError(''); }, []);

  const submitOrder = async (declaration: boolean) => {
    if (!address || !cart) {
      toast.error('Please choose a delivery address');
      return;
    }
    if (needsRx && !rx) {
      setRxError('Choose or upload your prescription first.');
      setStep('prescription');
      return;
    }
    setPlacing(true);
    try {
      const placed: PlacedOrder = await placeOrder(buildOrderBody(address, cart, declaration, needsRx ? rx?.id : null));
      setOrder(placed);
      // Ordered lines were removed from the server cart; the prescription is now with the order
      queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY });
      if (placed.requires_prescription) queryClient.invalidateQueries({ queryKey: prescriptionKeys.mine });
      setStep('payment');
    } catch (err) {
      const message = getApiErrorMessage(err, 'We could not place your order. Please try again.');
      if (needsRx && isPrescriptionProblem(err)) {
        // The order was not placed: choose or upload another prescription, then place it again
        setRxError(`${message} Please choose or upload another one.`);
        setStep('prescription');
      } else toast.error(message);
    } finally {
      setPlacing(false);
    }
  };

  const content = () => {
    if (step === 'confirmed' && order) {
      return <OrderConfirmed orderNumber={order.order_number} totalPaise={order.total_paise} shipments={order.shipments} demo={!!paidDemo}
        paidBy={paidDemo?.paidBy} rx={order.requires_prescription ? rx : null} authorised={authorised} />;
    }
    if (step === 'payment' && order) {
      return <PaymentStep order={order} rx={order.requires_prescription ? rx : null}
        onPaid={({ demo, paidBy, authorised: held }) => { setPaidDemo(demo ? { paidBy } : null); setAuthorised(!!held); setStep('confirmed'); }} />;
    }

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
    if (step === 'prescription') {
      return (
        <PrescriptionStep rxItems={rxItems} selectedId={rx?.id ?? null} onSelect={chooseRx} error={rxError}
          onBack={() => setStep('address')} onContinue={() => { setRxError(''); setStep('review'); }} />
      );
    }
    if (step === 'review' && previewBody) {
      return (
        <ReviewStep
          body={previewBody}
          needsDeclaration={customerType === 'doc_hospital'}
          placing={placing}
          rx={needsRx ? rx : null}
          onChangeRx={() => setStep('prescription')}
          backLabel={needsRx ? 'Prescription' : 'Address'}
          onBack={() => setStep(needsRx ? 'prescription' : 'address')}
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
        continueLabel={needsRx ? 'Continue to prescription' : 'Review order'}
        onBack={() => router.push('/cart')}
        onContinue={() => setStep(needsRx ? 'prescription' : 'review')}
      />
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6">
        {step !== 'confirmed' && <CheckoutStepIndicator step={step} showPrescription={needsRx} />}
        {step !== 'confirmed' && <TradePriceBanner className="mb-4" />}
        {content()}
      </div>
    </div>
  );
}
