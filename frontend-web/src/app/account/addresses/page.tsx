'use client';
import Header from '@/components/layout/Header';
import BackLink from '@/components/admin/BackLink';
import AddressManager from '@/components/addresses/AddressManager';

export default function AddressesPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6">
        <BackLink href="/account" label="My account" />
        <h1 className="text-lg font-semibold mb-1">Saved addresses</h1>
        <p className="text-xs text-gray-500">Editing an address used on a past order keeps that order&apos;s address unchanged.</p>
        <AddressManager />
      </div>
    </div>
  );
}
