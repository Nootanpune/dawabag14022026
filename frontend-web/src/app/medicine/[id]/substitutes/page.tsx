'use client';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Header from '@/components/layout/Header';
import Breadcrumbs from '@/components/layout/Breadcrumbs';
import QueryState from '@/components/admin/QueryState';
import SubstituteRow from '@/components/shop/substitutes/SubstituteRow';
import SubstitutesNote from '@/components/shop/substitutes/SubstitutesNote';
import { fetchSubstitutes, perUnitText, productPageKeys } from '@/lib/shop/productPageExtras';

// Every substitute for a medicine: same composition, strength, form, release type,
// route and comparable pack; cheapest per unit first. A list only — nothing is
// swapped; the buyer asks their doctor or pharmacist first (C-08).
export default function SubstitutesPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({ queryKey: productPageKeys.substitutes(id), queryFn: () => fetchSubstitutes(id) });
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <Breadcrumbs items={[
          { label: 'Home', href: '/' },
          { label: data?.product.name ?? 'Medicine', href: `/shop/${id}` },
          { label: 'Substitutes' },
        ]} />
        <h1 className="text-lg font-semibold">Substitutes{data ? ` for ${data.product.name}` : ''}</h1>
        {data && (
          <p className="text-sm text-gray-600">
            {data.product.name}: {perUnitText(data.product.per_unit_paise, data.product.unit_label)}. Cheapest per unit first.
          </p>
        )}
        <QueryState isLoading={isLoading} error={error} isEmpty={!!data && data.total === 0}
          emptyText="No substitutes with the same medicine, strength and form are listed right now." />
        {data && data.total > 0 && (
          <section className="card text-sm" data-testid="substitutes-all">
            <ul className="divide-y divide-gray-100">
              {data.substitutes.map((s) => <SubstituteRow key={s.id} s={s} />)}
            </ul>
          </section>
        )}
        {data && <SubstitutesNote note={data.note} consultHref={data.consult_href} />}
      </div>
    </div>
  );
}
