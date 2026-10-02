'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchMyPrescriptions, prescriptionKeys } from '@/lib/prescriptions/api';
import RequireAuth from '@/components/auth/RequireAuth';
import Header from '@/components/layout/Header';
import PrescriptionUploadCard from '@/components/prescriptions/PrescriptionUploadCard';
import PrescriptionList from '@/components/prescriptions/PrescriptionList';
import AfterUploadNext from '@/components/prescriptions/AfterUploadNext';

// Upload a prescription any time and see the ones in your account (Sprint 25).
// Signed out → sign in and come back here (RequireAuth). C-08: a pharmacist checks
// every prescription with the order before medicines are dispensed.
export default function PrescriptionsPage() {
  return (
    <RequireAuth>
      <PrescriptionsView />
    </RequireAuth>
  );
}

function PrescriptionsView() {
  const [justUploaded, setJustUploaded] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: prescriptionKeys.mine, queryFn: fetchMyPrescriptions });
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Prescriptions</h1>
          <p className="text-sm text-gray-600 mt-1">
            Upload your doctor’s prescription, add the medicines to your cart, and choose the prescription at checkout.
          </p>
        </div>
        <PrescriptionUploadCard onUploaded={() => setJustUploaded(true)} />
        {justUploaded && <AfterUploadNext />}
        <PrescriptionList prescriptions={data} isLoading={isLoading} />
      </main>
    </div>
  );
}
