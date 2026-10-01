'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { productKeys, reviewContent, type ContentReviewItem } from '@/lib/products/api';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { useAuthStore } from '@/store/authStore';
import { formatDateTimeIST } from '@/lib/dates';

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500">{label}</p>
      <p className="whitespace-pre-wrap text-gray-800">{value?.trim() || '—'}</p>
    </div>
  );
}

/**
 * One product's copy for pharmacist review (C-19). Likely forbidden claims
 * (Drugs and Magic Remedies Act) are flagged by the server; approving flagged
 * copy needs a note of at least 20 characters.
 */
export default function ContentReviewCard({ p }: { p: ContentReviewItem }) {
  const queryClient = useQueryClient();
  const canDecide = useAuthStore((s) => s.user?.role) === 'pharmacist_rx';
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const flags = p.content_flags ?? [];

  const review = useMutation({
    mutationFn: (approve: boolean) => reviewContent(p.id, approve, notes.trim()),
    onSuccess: (_r, approve) => toast.success(`${p.name}: copy ${approve ? 'approved' : 'rejected'}`),
    onError: (err) => setError(getApiErrorMessage(err, 'Could not save the review')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: productKeys.contentQueue }),
  });

  const submit = (approve: boolean) => {
    const min = approve && flags.length ? 20 : 3;
    if (notes.trim().length < min) return setError(`Enter a note of at least ${min} characters`);
    setError('');
    review.mutate(approve);
  };

  return (
    <div className="card text-sm space-y-3">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <p className="font-semibold">{p.name}</p>
          <p className="text-xs text-gray-500">
            {p.sku} · {p.drug_schedule ?? 'OTC'} · updated {formatDateTimeIST(p.updated_at)}
          </p>
        </div>
      </div>
      {flags.length > 0 && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-2 text-xs text-red-800 space-y-1">
          <p className="font-semibold flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> Possible prohibited claims
          </p>
          {flags.map((f, i) => (
            <p key={i}>
              <span className="font-medium">{f.condition}</span> ({f.claim}): “{f.excerpt}”
            </p>
          ))}
        </div>
      )}
      <Field label="Description" value={p.description} />
      <Field label="Composition" value={p.composition} />
      <Field label="Storage" value={p.storage_instructions} />
      {canDecide ? (
        <div className="border-t border-gray-100 pt-3">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder={flags.length ? 'Why the flagged wording is acceptable (min 20 characters)' : 'Review notes'}
            className="input"
          />
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          <div className="flex gap-2 mt-2 justify-end">
            <button onClick={() => submit(false)} disabled={review.isPending} className="btn-outline text-xs text-red-600">
              Reject copy
            </button>
            <button onClick={() => submit(true)} disabled={review.isPending} className="btn-primary text-xs">
              Approve copy
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-400">Only a registered pharmacist (pharmacist_rx) can approve copy.</p>
      )}
    </div>
  );
}
