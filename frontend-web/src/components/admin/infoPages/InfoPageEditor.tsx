'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import QueryState from '@/components/admin/QueryState';
import InfoPageBody from '@/components/trust/InfoPageBody';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { formatDateTimeIST } from '@/lib/dates';
import { INFO_PAGE_TOKENS, fetchInfoPageHistory, infoPageKeys, publishInfoPage, type InfoPage, type InfoPageKey } from '@/lib/infoPages/api';

function Form({ pageKey, latest }: { pageKey: InfoPageKey; latest: InfoPage }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(latest.title);
  const [summary, setSummary] = useState(latest.summary);
  const [body, setBody] = useState(latest.body);
  const [error, setError] = useState('');
  const publish = useMutation({
    mutationFn: () => publishInfoPage(pageKey, { title: title.trim(), summary: summary.trim(), body: body.trim() }),
    onSuccess: (r) => {
      toast.success(`Published version ${r.version}`);
      queryClient.invalidateQueries({ queryKey: infoPageKeys.history(pageKey) });
      queryClient.invalidateQueries({ queryKey: infoPageKeys.one(pageKey) });
    },
    onError: (e) => setError(getApiErrorMessage(e, 'Could not publish')),
  });
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); setError(''); publish.mutate(); }}>
      <div>
        <label htmlFor={`${pageKey}-title`} className="block text-xs font-semibold mb-1">Title</label>
        <input id={`${pageKey}-title`} className="input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <label htmlFor={`${pageKey}-summary`} className="block text-xs font-semibold mb-1">Summary</label>
        <textarea id={`${pageKey}-summary`} className="input" rows={2} maxLength={300} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <label htmlFor={`${pageKey}-body`} className="block text-xs font-semibold mb-1">Text (blank line = new paragraph, “## ” heading, “- ” list item)</label>
          <textarea id={`${pageKey}-body`} className="input font-mono text-xs" rows={18} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        <div className="rounded-lg border border-gray-200 p-3 bg-white">
          <p className="text-xs font-semibold text-gray-500 mb-2">Preview (placeholders are filled when shown)</p>
          <InfoPageBody body={body} />
        </div>
      </div>
      <details className="text-xs text-gray-600">
        <summary className="cursor-pointer">Placeholders filled from today’s settings</summary>
        <ul className="mt-1 space-y-0.5">{INFO_PAGE_TOKENS.map((t) => <li key={t.token}><code>{t.token}</code> — {t.meaning}</li>)}</ul>
      </details>
      <p className="text-xs text-amber-800">Say only what Dawabag actually does (C-04, C-17). Each publish is a new version; older ones are kept.</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end">
        <button type="submit" disabled={publish.isPending} className="btn-primary text-sm inline-flex items-center gap-1.5">
          {publish.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Publish new version
        </button>
      </div>
    </form>
  );
}

/** One trust page: edit and publish a new version; earlier versions listed. */
export default function InfoPageEditor({ pageKey, label }: { pageKey: InfoPageKey; label: string }) {
  const { data, isLoading, error } = useQuery({ queryKey: infoPageKeys.history(pageKey), queryFn: () => fetchInfoPageHistory(pageKey) });
  const latest = data?.[0];
  return (
    <section className="card space-y-3" aria-label={label}>
      <h2 className="font-semibold">{label}</h2>
      <QueryState isLoading={isLoading} error={error} isEmpty={!latest} emptyText="Not published yet" />
      {latest && <Form key={`${pageKey}-${latest.version}`} pageKey={pageKey} latest={latest} />}
      {data && data.length > 0 && (
        <p className="text-xs text-gray-500">
          Versions: {data.map((v) => `v${v.version} (${formatDateTimeIST(v.published_at)}${v.published_by_name ? `, ${v.published_by_name}` : ''})`).join(' · ')}
        </p>
      )}
    </section>
  );
}
