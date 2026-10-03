'use client';
import Link from 'next/link';
import { usePathname, useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  fetchPolicy,
  isPolicyKey,
  isPolicyLanguage,
  LANGUAGE_NAMES,
  POLICY_LABELS,
  policyKeys,
  type PolicyLanguage,
} from '@/lib/legal/policies';
import Header from '@/components/layout/Header';
import QueryState from '@/components/admin/QueryState';
import PolicyBody from '@/components/legal/PolicyBody';
import PolicyLanguageSwitcher from '@/components/legal/PolicyLanguageSwitcher';
import TranslationNote from '@/components/legal/TranslationNote';
import { formatDateIST } from '@/lib/dates';

// Public policy page, from the server (C-39). ?version=n shows an older version;
// ?lang=mr|hi shows the Marathi / Hindi text where published (C-40).
export default function PolicyPage() {
  const { key } = useParams<{ key: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const version = Number(searchParams?.get('version')) || undefined;
  const langParam = searchParams?.get('lang');
  const lang: PolicyLanguage = isPolicyLanguage(langParam) ? langParam : 'en';
  const valid = isPolicyKey(key);
  const { data, isLoading, error } = useQuery({
    queryKey: policyKeys.one(key, version, lang),
    queryFn: () => fetchPolicy(key as never, version, lang),
    enabled: valid,
    retry: false,
  });

  const notPublished = (error as { response?: { status?: number } } | null)?.response?.status === 404;

  // The language lives in the URL only, so the page refetches from the server
  const changeLang = (next: PolicyLanguage) => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (next === 'en') params.delete('lang');
    else params.set('lang', next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname ?? '/policies');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/policies" className="text-sm text-gray-500 hover:text-brand-600">
            ← All policies
          </Link>
          {valid && <PolicyLanguageSwitcher value={lang} onChange={changeLang} />}
        </div>
        {!valid ? (
          <p className="card mt-3 text-sm text-gray-500">This policy does not exist.</p>
        ) : (
          <>
            {/* Sprint 43 (QA): a policy not yet published is not an error for the visitor */}
            {notPublished ? (
              <div className="card mt-3 text-sm text-gray-600">
                <h1 className="text-lg font-semibold text-gray-900 mb-1">{POLICY_LABELS[key]}</h1>
                <p>This policy is being prepared and will appear here once it is published.</p>
                <p className="mt-2">
                  Questions in the meantime? See{' '}
                  <Link href="/legal" className="text-brand-700 hover:underline">licences and grievance redressal</Link>.
                </p>
              </div>
            ) : (
              <QueryState isLoading={isLoading} error={error} isEmpty={false} emptyText="" />
            )}
            {data && (
              <article className="card mt-3">
                <TranslationNote doc={data} />
                <div lang={data.language ?? 'en'}>
                  <h1 className="text-xl font-semibold">{data.title || POLICY_LABELS[key]}</h1>
                  <p className="text-xs text-gray-500 mb-4">
                    Version {data.version}
                    {data.language && data.language !== 'en' ? ` (${LANGUAGE_NAMES[data.language]})` : ''} · effective from{' '}
                    {formatDateIST(data.effective_from)}
                  </p>
                  <PolicyBody body={data.body} />
                </div>
              </article>
            )}
          </>
        )}
      </div>
    </div>
  );
}
