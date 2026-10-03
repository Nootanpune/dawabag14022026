'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';
import CopyButton from '@/components/admin/partners/CopyButton';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { apiKeyKeys, issueApiKey, type IssuedKey, type KeyOwner } from '@/lib/partnerApiKeys';

/**
 * Issue a key, then show it ONCE. It lives only in this dialog's memory: closing the
 * dialog forgets it (nothing is stored in the browser, and the server keeps only a hash).
 */
export default function NewKeyDialog({ owner, onClose }: { owner: KeyOwner; onClose: () => void }) {
  const qc = useQueryClient();
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [issued, setIssued] = useState<IssuedKey | null>(null);
  const issue = useMutation({
    mutationFn: () => issueApiKey(owner, label),
    onSuccess: (r) => { setIssued(r); qc.invalidateQueries({ queryKey: apiKeyKeys.list(owner) }); },
    onError: (e) => setError(getApiErrorMessage(e, 'Could not issue the key')),
  });
  const submit = () => {
    if (label.trim().length < 2) return setError('Name the key, e.g. "Billing PC, counter 1"');
    setError('');
    issue.mutate();
  };

  if (issued) {
    return (
      <Modal title="Copy the key now" onClose={onClose} size="lg">
        <div className="space-y-3" data-testid="issued-key">
          <p className="text-sm text-gray-700 flex items-start gap-2">
            <KeyRound className="w-4 h-4 mt-0.5 shrink-0 text-brand-700" aria-hidden="true" />
            <span>{issued.note}</span>
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-lg bg-gray-100 px-3 py-2 text-xs" aria-label="API key">{issued.secret}</code>
            <CopyButton text={issued.secret} label="Copy the API key" />
          </div>
          <p className="text-xs text-gray-500">Key name: {issued.key.label} · may only upload stock files for this partner.</p>
          <div className="flex justify-end">
            <button type="button" className="btn-primary text-sm" onClick={onClose}>I have copied it</button>
          </div>
        </div>
      </Modal>
    );
  }
  return (
    <Modal title="New API key for the stock feed" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <label htmlFor="key-label" className="block text-sm font-medium text-gray-700 mb-1">Which computer or program will use it?</label>
        <input id="key-label" className="input w-full" maxLength={80} value={label} autoFocus autoComplete="off"
          onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Billing PC, counter 1" />
        <p className="text-xs text-gray-500 mt-2">The key is shown once. Dawabag keeps only a fingerprint of it, so it cannot be shown again.</p>
        <DialogActions onCancel={onClose} onConfirm={submit} confirmLabel="Issue key" pending={issue.isPending} error={error} />
      </form>
    </Modal>
  );
}
