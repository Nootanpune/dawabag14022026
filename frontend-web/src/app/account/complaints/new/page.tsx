'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Header from '@/components/layout/Header';
import BackLink from '@/components/admin/BackLink';
import NewComplaintForm from '@/components/grievances/NewComplaintForm';
import GrievanceOfficerNote from '@/components/grievances/GrievanceOfficerNote';

/** ?order=<id> pre-selects the order (link from the order detail page). */
function FormWithOrder() {
  const orderId = useSearchParams()?.get('order') ?? undefined;
  return <NewComplaintForm initialOrderId={orderId} />;
}

export default function NewComplaintPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6">
        <BackLink href="/account/complaints" label="Complaints" />
        <h1 className="text-lg font-semibold mb-3">New complaint</h1>
        <GrievanceOfficerNote />
        <Suspense fallback={null}>
          <FormWithOrder />
        </Suspense>
      </div>
    </div>
  );
}
