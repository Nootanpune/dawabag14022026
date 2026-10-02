'use client';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Header from '@/components/layout/Header';
import Breadcrumbs from '@/components/layout/Breadcrumbs';
import QueryState from '@/components/admin/QueryState';
import InfoPageBody from '@/components/trust/InfoPageBody';
import TrustLinks from '@/components/trust/TrustLinks';
import { fetchInfoPage, infoPageKeys, isInfoPageKey } from '@/lib/infoPages/api';
import { formatDateIST } from '@/lib/dates';

// Trust pages (Sprint 33): text kept on the server, numbers filled from today's settings.
export default function TrustPage() {
  const { key } = useParams<{ key: string }>();
  const valid = isInfoPageKey(key);
  const { data, isLoading, error } = useQuery({ queryKey: infoPageKeys.one(key), queryFn: () => fetchInfoPage(key), enabled: valid });
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: data?.title ?? 'About Dawabag' }]} />
        {!valid ? (
          <p className="text-sm text-gray-600">This page does not exist.</p>
        ) : (
          <QueryState isLoading={isLoading} error={error} isEmpty={false} emptyText="" />
        )}
        {data && (
          <article className="card">
            <h1 className="text-xl font-semibold text-gray-900">{data.title}</h1>
            <p className="text-sm text-gray-600 mt-1 mb-4">{data.summary}</p>
            <InfoPageBody body={data.body} />
            <p className="text-xs text-gray-400 mt-6">Version {data.version} · updated {formatDateIST(data.published_at)}</p>
          </article>
        )}
        <nav aria-label="More about how we work" className="text-sm">
          <TrustLinks className="flex flex-wrap gap-x-4 gap-y-1" linkClassName="text-brand-700 hover:underline" />
        </nav>
      </div>
    </div>
  );
}
