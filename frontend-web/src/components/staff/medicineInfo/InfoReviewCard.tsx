'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { useAuthStore } from '@/store/authStore';
import { formatDateTimeIST } from '@/lib/dates';
import { medicineInfoKeys, reviewInfo } from '@/lib/medicineInfo/api';
import { presentSections, withDefaults, type InfoQueueItem } from '@/lib/medicineInfo/types';
import { previewSections } from '@/lib/medicineInfo/form';
import InfoSectionBody from '@/components/shop/medicineInfo/InfoSectionBody';

/**
 * One version of medicine information waiting for review (C-19), shown exactly as
 * buyers would see it. Flagged claims need a reason of 20+ characters to approve;
 * only a pharmacist with a council registration can decide (server-enforced).
 * Sprint 36 (four eyes): the person who wrote or sent it cannot approve it — a second
 * pharmacist must; they may still withdraw it (reject). The server enforces this too.
 */
export default function InfoReviewCard({ v }: { v: InfoQueueItem }) {
  const queryClient = useQueryClient();
  const canDecide = useAuthStore((s) => s.user?.role) === 'pharmacist_rx';
  const own = !!v.authored_by_you;
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const sections = previewSections(withDefaults(v.content));
  const review = useMutation({
    mutationFn: (approve: boolean) => reviewInfo(v.product_id, approve, notes.trim()),
    onSuccess: (_r, approve) => toast.success(`${v.product_name}: medicine information ${approve ? 'approved' : 'rejected'}`),
    onError: (e) => setError(getApiErrorMessage(e, 'Could not save the review')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: medicineInfoKeys.queue }),
  });
  const decide = (approve: boolean) => {
    const min = approve && v.flags.length ? 20 : 3;
    if (notes.trim().length < min) return setError(`Enter a note of at least ${min} characters`);
    setError('');
    review.mutate(approve);
  };

  return (
    <article className="card text-sm space-y-3" aria-label={`Medicine information for ${v.product_name}`} data-testid="info-review-card">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <p className="font-semibold">{v.product_name} <span className="font-normal text-gray-500">· version {v.version}</span></p>
          <p className="text-xs text-gray-500">
            {v.sku} · {v.drug_schedule ?? '—'} · sent {v.submitted_at ? formatDateTimeIST(v.submitted_at) : ''}{v.submitted_by_name ? ` by ${v.submitted_by_name}` : ''}
          </p>
        </div>
        <Link href={`/staff/medicine-info/${v.product_id}`} className="text-xs text-brand-700 underline self-start">Open in the editor</Link>
      </div>
      {!!v.author_names?.length && <p className="text-xs text-gray-500">Written by {v.author_names.join(', ')}</p>}
      {own && (
        <p className="text-xs rounded-lg bg-amber-50 border border-amber-200 p-2 text-amber-900" data-testid="own-version">
          You wrote or sent this version, so another registered pharmacist must approve it. You can still withdraw it.
        </p>
      )}
      {v.flags.length > 0 && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-2 text-xs text-red-800 space-y-1">
          <p className="font-semibold flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Possible prohibited claims</p>
          {v.flags.map((f, i) => <p key={i}><span className="font-medium">{f.condition}</span> ({f.claim}): “{f.excerpt}”</p>)}
        </div>
      )}
      <div className="divide-y divide-gray-100 border rounded-lg px-3">
        {presentSections(sections).map(({ key, label }) => (
          <div key={key} className="py-2">
            <p className="text-xs font-semibold text-gray-500 mb-1">{label}</p>
            <InfoSectionBody k={key} s={sections} />
          </div>
        ))}
      </div>
      {canDecide ? (
        <div className="border-t border-gray-100 pt-3">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="input" aria-label="Review notes"
            placeholder={own ? 'Why you are withdrawing it' : v.flags.length ? 'Why the flagged wording is acceptable (min 20 characters)' : 'Review notes, e.g. checked against the package insert; a rejection reason goes back to the writer'} />
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
          <div className="flex gap-2 mt-2 justify-end">
            <button type="button" onClick={() => decide(false)} disabled={review.isPending} className="btn-outline text-xs text-red-600">
              {own ? 'Withdraw' : 'Reject'}
            </button>
            {!own && <button type="button" onClick={() => decide(true)} disabled={review.isPending} className="btn-primary text-xs">Approve</button>}
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-400">Only a registered pharmacist (pharmacist_rx) can approve medicine information.</p>
      )}
    </article>
  );
}
