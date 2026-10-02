'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ShoppingBag, LogIn, FileUp } from 'lucide-react';
import api from '@/lib/api';
import { searchHref } from '@/lib/search/searchUrl';
import { categoryIcon } from '@/lib/shop/categoryIcon';
import EmptyState from '@/components/ui/EmptyState';
import SearchCombobox from '@/components/search/SearchCombobox';
import type { Category } from '@/components/home/CategoryTiles';

/** Empty cart: search, popular categories and the prescription upload, so the next step is one tap. */
export default function EmptyCart({ signedIn }: { signedIn: boolean }) {
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => (await api.get('/products/categories')).data.data,
    enabled: signedIn,
  });
  if (!signedIn) {
    return (
      <EmptyState
        icon={LogIn}
        as="h1"
        title="Sign in to see your cart"
        hint="Your cart is kept in your Dawabag account, so it is the same on every device."
        action={{ label: 'Sign in', href: '/auth/login?next=%2Fcart' }}
      />
    );
  }
  const named = categories.filter((c): c is Category & { category: string } => !!c.category).slice(0, 8);
  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-brand-50 flex items-center justify-center mb-4 mx-auto">
          <ShoppingBag className="w-8 h-8 text-brand-600" aria-hidden="true" />
        </div>
        <h1 className="text-lg font-semibold text-gray-800">Your cart is empty</h1>
        <p className="text-sm text-gray-500 mt-1">Search for a medicine by brand or generic name and add it here.</p>
      </div>
      <SearchCombobox id="cart-add-search" label="Add more medicines" placeholder="Search medicines, e.g. paracetamol" size="lg" className="mt-5" />
      {named.length > 0 && (
        <section aria-labelledby="empty-cats-heading" className="mt-6">
          <h2 id="empty-cats-heading" className="text-sm font-semibold text-gray-900 mb-2">Popular categories</h2>
          <ul className="flex flex-wrap gap-2">
            {named.map((c) => {
              const Icon = categoryIcon(c.category);
              return (
                <li key={c.category}>
                  <Link href={searchHref({ category: c.category })}
                    className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:border-brand-400">
                    <Icon className="w-4 h-4 text-brand-600" aria-hidden="true" /> {c.category}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <Link href="/prescriptions" className="card mt-6 flex items-center gap-3 hover:border-brand-400">
        <FileUp className="w-6 h-6 text-brand-600 shrink-0" aria-hidden="true" />
        <span className="flex-1">
          <span className="block text-sm font-medium text-gray-900">Have a prescription?</span>
          <span className="block text-xs text-gray-500">Upload it now and choose it at checkout. Our pharmacist checks it before dispatch.</span>
        </span>
      </Link>
    </div>
  );
}
