'use client';
import Header from '@/components/layout/Header';
import BackLink from '@/components/admin/BackLink';
import YourLicencesSection from '@/components/licences/YourLicencesSection';
import { useAuthStore } from '@/store/authStore';
import type { LicenceForm, Party } from '@/lib/licences/forms';

const PARTY: Record<string, { party: Party; suggested: LicenceForm[] }> = {
  b2b_retailer: { party: 'retailer', suggested: ['dl20', 'dl21'] },
  b2b_wholesaler: { party: 'wholesaler', suggested: ['dl20b', 'dl21b'] },
  doc_hospital: { party: 'doctor', suggested: ['dl20', 'dl21'] },
};

/** A business or doctor account's drug licences (C-11, C-14): see them, send renewals. */
export default function MyLicencesPage() {
  const type = useAuthStore((s) => s.user?.customer_type) ?? '';
  const p = PARTY[type];
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6">
        <BackLink href="/account" label="My account" />
        <h1 className="text-lg font-semibold mb-3">Your drug licences</h1>
        {p ? <YourLicencesSection holder="buyer" party={p.party} suggested={p.suggested} />
          : <p className="text-sm text-gray-500">Drug licences are kept for retailer, wholesaler and doctor / hospital accounts.</p>}
      </div>
    </div>
  );
}
