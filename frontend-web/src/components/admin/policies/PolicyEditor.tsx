'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchPolicy, policyKeys, publishPolicy, POLICY_LABELS, type PolicyKey } from '@/lib/legal/policies';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { todayIST } from '@/lib/fulfilment/roles';
import DialogActions from '@/components/admin/DialogActions';

interface Props {
  docKey: PolicyKey;
  /** latest version number, used to pre-fill the editor */
  latestVersion?: number;
}

/** Publishes a NEW version of a policy (C-39); old versions stay on the server unchanged. */
export default function PolicyEditor({ docKey, latestVersion }: Props) {
  const queryClient = useQueryClient();
  const latest = useQuery({
    queryKey: policyKeys.one(docKey, latestVersion),
    queryFn: () => fetchPolicy(docKey, latestVersion),
    enabled: !!latestVersion,
  });
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(todayIST());
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setTitle(latest.data?.title ?? POLICY_LABELS[docKey]);
    setBody(latest.data?.body ?? '');
  }, [latest.data, docKey]);

  const publish = useMutation({
    mutationFn: () =>
      publishPolicy({ doc_key: docKey, title: title.trim(), body: body.trim(), effective_from: effectiveFrom, lawyer_reviewed: reviewed }),
    onSuccess: (r) => {
      toast.success(`${POLICY_LABELS[docKey]} version ${r.version} published`);
      setReviewed(false);
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not publish')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: policyKeys.list }),
  });

  const submit = () => {
    if (title.trim().length < 3) return setError('Enter a title');
    if (body.trim().length < 50) return setError('The policy text must be at least 50 characters');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) return setError('Choose the effective date');
    if (!reviewed && !window.confirm('Publish without a lawyer review? This is recorded on the version.')) return;
    setError('');
    publish.mutate();
  };

  return (
    <div className="card space-y-3 text-sm">
      <h2 className="font-semibold">Publish a new version</h2>
      <label className="block">
        <span className="block font-medium text-gray-700 mb-1">Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className="input" />
      </label>
      <label className="block">
        <span className="block font-medium text-gray-700 mb-1">Text</span>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={16} className="input font-mono text-xs" />
        <span className="block text-xs text-gray-400 mt-1">
          Plain text. Blank line = new paragraph; “# ” = heading; “- ” = bullet.
        </span>
      </label>
      <div className="flex flex-wrap gap-4 items-end">
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Effective from</span>
          <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} className="input" />
        </label>
        <label className="flex items-center gap-2 pb-2">
          <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
          Reviewed by a lawyer
        </label>
      </div>
      <DialogActions
        onCancel={() => {
          setTitle(latest.data?.title ?? POLICY_LABELS[docKey]);
          setBody(latest.data?.body ?? '');
          setError('');
        }}
        onConfirm={submit}
        confirmLabel="Publish new version"
        pending={publish.isPending}
        error={error}
      />
    </div>
  );
}
