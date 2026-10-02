'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { fetchSubstitutes, perUnitText, productPageKeys } from '@/lib/shop/productPageExtras';
import SubstituteRow from './SubstituteRow';
import SubstitutesNote from './SubstitutesNote';

const PREVIEW = 3;

/** Product page: the cheapest few substitutes and a link to all of them. Hidden when there are none. */
export default function SubstitutesPreview({ productId }: { productId: string }) {
  const { data } = useQuery({ queryKey: productPageKeys.substitutes(productId, PREVIEW), queryFn: () => fetchSubstitutes(productId, PREVIEW) });
  if (!data?.total) return null;
  return (
    <section className="card text-sm" aria-labelledby="substitutes-heading" data-testid="substitutes">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="substitutes-heading" className="font-semibold text-base">Substitutes</h2>
        <span className="text-xs text-gray-500">This medicine: {perUnitText(data.product.per_unit_paise, data.product.unit_label)}</span>
      </div>
      <ul className="divide-y divide-gray-100">
        {data.substitutes.map((s) => <SubstituteRow key={s.id} s={s} />)}
      </ul>
      {data.total > data.substitutes.length && (
        <Link href={`/medicine/${productId}/substitutes`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline mb-2">
          See all {data.total} substitutes <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </Link>
      )}
      <SubstitutesNote note={data.note} consultHref={data.consult_href} />
    </section>
  );
}
