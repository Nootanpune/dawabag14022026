'use client';
import Link from 'next/link';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import SearchCombobox from '@/components/search/SearchCombobox';

/** After an upload: add the medicines on it, then check out (the pharmacist checks it, C-08). */
export default function AfterUploadNext() {
  return (
    <section aria-labelledby="next-heading" className="card border-brand-200 bg-brand-50/40">
      <h2 id="next-heading" className="flex items-center gap-2 text-base font-semibold text-brand-800">
        <CheckCircle2 className="w-5 h-5" aria-hidden="true" /> Prescription uploaded
      </h2>
      <p className="text-sm text-gray-700 mt-1">Now add the medicines from your prescription to your cart.</p>
      <SearchCombobox id="rx-medicine-search" label="Find a medicine from your prescription" placeholder="Type the medicine name from your prescription" className="mt-3" />
      <p className="mt-3 flex items-start gap-2 text-xs text-gray-600">
        <ShieldCheck className="w-4 h-4 text-brand-600 shrink-0" aria-hidden="true" />
        At checkout, choose this prescription. Our pharmacist checks it against your order before anything is dispatched.
      </p>
      <Link href="/cart" className="inline-block mt-3 text-sm font-medium text-brand-700 hover:underline">Go to cart</Link>
    </section>
  );
}
