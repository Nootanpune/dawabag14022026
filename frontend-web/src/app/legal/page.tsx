'use client';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import QueryState from '@/components/admin/QueryState';
import LegalBlocks from '@/components/legal/LegalBlocks';
import { useLegalInfo } from '@/components/legal/useLegalInfo';

// Public page: seller identity, licences and grievance officer (C-04, C-36).
export default function LegalPage() {
  const { data, isLoading, error } = useLegalInfo();
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-5xl mx-auto px-4 py-6">
        <h1 className="text-lg font-semibold mb-1">Licences &amp; grievance redressal</h1>
        <p className="text-sm text-gray-500 mb-5">
          Details required under the Drugs and Cosmetics Rules and the Consumer Protection (E-Commerce) Rules, 2020.
        </p>
        <QueryState isLoading={isLoading} error={error} isEmpty={false} emptyText="" />
        {data && (
          <div className="card">
            <LegalBlocks info={data} />
          </div>
        )}
        <div className="card mt-4 text-sm text-gray-600">
          <h2 className="font-semibold text-gray-800 mb-1">Have a complaint?</h2>
          <p>
            Signed-in customers can raise and track a complaint under{' '}
            <Link href="/account/complaints" className="text-brand-600 hover:underline">
              My account → Complaints
            </Link>
            . You can also write to the grievance officer above.
          </p>
        </div>
      </div>
    </div>
  );
}
