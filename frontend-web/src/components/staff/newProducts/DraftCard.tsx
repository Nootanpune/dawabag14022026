'use client';
import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { formatDateTimeIST } from '@/lib/dates';
import { hasClaimWarning, NEVER_ONLINE, type Draft, type DraftOptions } from '@/lib/admin/catalogueDrafts';
import ReasonDialog from '@/components/admin/ReasonDialog';
import Modal from '@/components/admin/Modal';
import FromFilePanel from './FromFilePanel';
import DraftFieldsGrid from './DraftFieldsGrid';
import { useDraftActions } from './useDraftActions';

const DONE_LABEL: Record<Draft['status'], string> = {
  open: 'To complete', approved: 'Approved — in the catalogue', not_listed: 'Approved — never sold online (C-10)', rejected: 'Not listed',
};

/** One new product: the file's details, the decisions, what is still missing, and Approve / Not listed. */
export default function DraftCard({ draft, options, canApprove, selected, onSelect }: {
  draft: Draft;
  options: DraftOptions | undefined;
  canApprove: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const { save, approve, reject } = useDraftActions(draft.id);
  const [rejecting, setRejecting] = useState(false);
  const [notesFor, setNotesFor] = useState(false);
  const [notes, setNotes] = useState('');
  const open = draft.status === 'open';
  const ready = open && draft.problems.length === 0;
  const neverOnline = !!draft.drug_schedule && NEVER_ONLINE.includes(draft.drug_schedule);
  const onApprove = () => (hasClaimWarning(draft) ? setNotesFor(true) : approve.mutate(undefined));

  return (
    <li className="card p-3 sm:p-4" aria-label={draft.name} data-testid="draft-card">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {open && <input type="checkbox" checked={selected} onChange={onSelect} className="w-4 h-4" aria-label={`Choose ${draft.name}`} />}
        <h2 className="font-medium text-sm flex-1 min-w-0 break-words">{draft.name}</h2>
        <span className="text-[11px] text-gray-400">{draft.sku}</span>
        {save.isPending ? (
          <span className="text-[11px] text-gray-500 inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Saving</span>
        ) : save.isSuccess ? (
          <span className="text-[11px] text-green-700 inline-flex items-center gap-1"><Check className="w-3 h-3" /> Saved</span>
        ) : null}
        {!open && <span className="text-xs font-medium">{DONE_LABEL[draft.status]}</span>}
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
        <FromFilePanel draft={draft} />
        {open ? (
          <DraftFieldsGrid draft={draft} options={options} onSave={(p) => save.mutate(p)} />
        ) : (
          <div className="text-xs text-gray-700 space-y-1">
            <p>{[draft.drug_schedule, draft.generic_name, draft.strength, draft.dosage_form, draft.category].filter(Boolean).join(' · ')}</p>
            {draft.decided_at && <p>Decided {formatDateTimeIST(draft.decided_at)}{draft.decided_by_name ? ` by ${draft.decided_by_name}` : ''}</p>}
            {draft.decision_note && <p>Note: {draft.decision_note}</p>}
          </div>
        )}
      </div>

      {open && (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[12rem] text-xs" aria-live="polite">
            {draft.problems.length > 0 ? (
              <p className="text-amber-800"><strong>Still needed:</strong> {draft.problems.join(' · ')}</p>
            ) : (
              <p className="text-green-700 font-medium">Ready to approve</p>
            )}
            {draft.warnings.map((w) => <p key={w} className="text-red-700">{w}</p>)}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setRejecting(true)} className="btn-outline text-xs py-1.5 px-3">Not a medicine we list</button>
            {canApprove ? (
              <button type="button" disabled={!ready || approve.isPending} onClick={onApprove}
                className="btn-primary text-xs py-1.5 px-3 disabled:opacity-50 inline-flex items-center gap-1">
                {approve.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                {neverOnline ? 'Approve as never sold online' : 'Approve'}
              </button>
            ) : (
              <span className="text-[11px] text-gray-500 self-center">Only a pharmacist can approve (C-19)</span>
            )}
          </div>
        </div>
      )}

      {rejecting && (
        <ReasonDialog title="Not a medicine we list" label="Why? (the partner sees this)" confirmLabel="Close it" minLength={3}
          pending={reject.isPending} onClose={() => setRejecting(false)}
          onConfirm={(reason) => reject.mutate(reason, { onSuccess: () => setRejecting(false) })} />
      )}
      {notesFor && (
        <Modal title="The copy may make a claim" onClose={() => setNotesFor(false)}>
          <p className="text-sm text-gray-700 mb-2">Change the description, or explain why it is acceptable (at least 20 characters, C-19).</p>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="input" aria-label="Why the copy is acceptable" autoFocus />
          <div className="flex justify-end gap-2 mt-3">
            <button type="button" onClick={() => setNotesFor(false)} className="btn-outline text-sm">Cancel</button>
            <button type="button" disabled={notes.trim().length < 20 || approve.isPending} className="btn-primary text-sm disabled:opacity-50"
              onClick={() => approve.mutate(notes.trim(), { onSuccess: () => setNotesFor(false) })}>Approve</button>
          </div>
        </Modal>
      )}
    </li>
  );
}
