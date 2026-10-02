'use client';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { Draft } from '@/lib/admin/catalogueDrafts';

/**
 * The description for buyers on an approved product (Sprint 31): shown, or "No
 * description yet — add one"; editing it sends the change back to the pharmacist's
 * Product copy check before buyers see it (C-19). Nothing is kept in the browser.
 */
export default function BuyerDescription({ draft, pending, onSave }: {
  draft: Draft;
  pending: boolean;
  onSave: (description: string | null, done: () => void) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(draft.description ?? '');
  const start = () => { setText(draft.description ?? draft.suggested_description ?? ''); setEditing(true); };
  const fieldId = `desc-${draft.id}`;

  if (!editing) {
    return (
      <div className="text-xs mt-1" data-testid="buyer-description">
        {draft.description ? (
          <p className="text-gray-700"><span className="font-medium">Description for buyers:</span> {draft.description}{' '}
            <button type="button" onClick={start} className="underline text-brand-700">Edit</button></p>
        ) : (
          <button type="button" onClick={start} className="underline text-brand-700">No description yet — add one</button>
        )}
        {draft.content_status === 'pending_review' && draft.description && (
          <p className="text-amber-800">Waiting for a pharmacist to approve it in Product copy (C-19); buyers do not see it yet.</p>
        )}
      </div>
    );
  }
  return (
    <form className="mt-2 space-y-1" onSubmit={(e) => { e.preventDefault(); onSave(text.trim() || null, () => setEditing(false)); }}>
      <label htmlFor={fieldId} className="block text-xs font-medium text-gray-700">Description for buyers (optional)</label>
      <textarea id={fieldId} value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2000} autoFocus className="input text-sm py-1.5" />
      <p className="text-[11px] text-gray-500">Keep it to the generic name, strength, form and pack — no claims. A pharmacist approves it before buyers see it (C-19).</p>
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn-primary text-xs py-1.5 px-3 inline-flex items-center gap-1 disabled:opacity-50">
          {pending && <Loader2 className="w-3 h-3 animate-spin" />} Save description
        </button>
        <button type="button" onClick={() => setEditing(false)} className="btn-outline text-xs py-1.5 px-3">Cancel</button>
      </div>
    </form>
  );
}
