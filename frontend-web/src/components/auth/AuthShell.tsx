import type { ReactNode } from 'react';
import Link from 'next/link';
import BrandLogo from '@/components/brand/BrandLogo';

/**
 * Sign-in, register and password pages after the owner's DAWA BAG mock: the logo with
 * its tagline centred at the top, then a heading and the form card.
 */
export default function AuthShell({ title, subtitle, children, wide }: {
  title: string; subtitle?: string; children: ReactNode; wide?: boolean;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-gray-50 flex items-start sm:items-center justify-center px-4 py-8">
      <div className={`w-full ${wide ? 'max-w-md' : 'max-w-sm'}`}>
        <div className="text-center mb-6">
          <Link href="/" className="inline-block" aria-label="DAWA BAG home">
            <BrandLogo variant="full" height={112} priority decorative />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-4">{title}</h1>
          {subtitle && <p className="text-sm text-gray-600 mt-1">{subtitle}</p>}
        </div>
        <div className="card rounded-3xl shadow-sm p-5 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
