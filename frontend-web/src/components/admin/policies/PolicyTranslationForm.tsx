'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  LANGUAGE_LABELS,
  LANGUAGE_NAMES,
  policyKeys,
  publishPolicyTranslation,
  POLICY_LABELS,
  type PolicyKey,
  type PolicyVersion,
  type TranslationLanguage,
} from '@/lib/legal/policies';
import { getApiErrorMessage } from '@/lib/apiErrors';
import DialogActions from '@/components/admin/DialogActions';

const TRANSLATIONS: TranslationLanguage[] = ['mr', 'hi'];

interface Props {
  docKey: PolicyKey;
  /** history rows (one per version per language), newest first */
  versions: PolicyVersion[];
}

/**
 * Publishes the Marathi / Hindi text of an English version (C-40). It takes the
 * English version's effective date; a published translation is never overwritten (409).
 */
export default function PolicyTranslationForm({ docKey, versions }: Props) {
  const queryClient = useQueryClient();
  const englishVersions = Array.from(new Set(versions.filter((v) => (v.language ?? 'en') === 'en').map((v) => v.version)));
  const [version, setVersion] = useState<number>(englishVersions[0] ?? 0);
  const published = (lang: TranslationLanguage) => versions.some((v) => v.version === version && v.language === lang);
  const [language, setLanguage] = useState<TranslationLanguage>(TRANSLATIONS.find((l) => !published(l)) ?? 'mr');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setTitle('');
    setBody('');
    setReviewed(false);
    setError('');
  };

  const publish = useMutation({
    mutationFn: () =>
      publishPolicyTranslation(docKey, { version, language, title: title.trim(), body: body.trim(), lawyer_reviewed: reviewed }),
    onSuccess: (r) => {
      toast.success(`${POLICY_LABELS[docKey]} v${r.version} published in ${LANGUAGE_NAMES[r.language]}`);
      reset();
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not publish the translation')),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: policyKeys.history(docKey) });
      queryClient.invalidateQueries({ queryKey: policyKeys.list });
    },
  });

  if (!englishVersions.length) return null;

  const submit = () => {
    if (title.trim().length < 3) return setError('Enter a title');
    if (body.trim().length < 50) return setError('The translated text must be at least 50 characters');
    if (published(language)) return setError(`Version ${version} is already published in ${LANGUAGE_NAMES[language]}`);
    if (!reviewed && !window.confirm('Publish without a lawyer review? This is recorded on the translation.')) return;
    setError('');
    publish.mutate();
  };

  return (
    <div className="card space-y-3 text-sm">
      <h2 className="font-semibold">Publish translation</h2>
      <p className="text-xs text-gray-500">
        Marathi or Hindi text of an English version. Readers who choose that language see it; otherwise they see English.
      </p>
      <div className="flex flex-wrap gap-4">
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">English version</span>
          <select value={version} onChange={(e) => setVersion(Number(e.target.value))} className="input">
            {englishVersions.map((v) => (
              <option key={v} value={v}>
                v{v}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Language</span>
          <select value={language} onChange={(e) => setLanguage(e.target.value as TranslationLanguage)} className="input">
            {TRANSLATIONS.map((l) => (
              <option key={l} value={l}>
                {LANGUAGE_LABELS[l]} ({LANGUAGE_NAMES[l]}){published(l) ? ' — published' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="block font-medium text-gray-700 mb-1">Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} lang={language} className="input" />
      </label>
      <label className="block">
        <span className="block font-medium text-gray-700 mb-1">Text</span>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} lang={language} className="input font-mono text-xs" />
        <span className="block text-xs text-gray-400 mt-1">Same format as the English text.</span>
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
        Reviewed by a lawyer
      </label>
      <DialogActions onCancel={reset} onConfirm={submit} confirmLabel="Publish translation" pending={publish.isPending} error={error} />
    </div>
  );
}
