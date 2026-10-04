'use client';
import { Lightbulb } from 'lucide-react';
import { formatDateTimeIST } from '@/lib/dates';
import type { Draft, DraftPatch } from '@/lib/admin/catalogueDrafts';
import { CONFIDENCE_LABEL, SUGGESTED_FIELDS, showSuggested, type SuggestedKey } from '@/lib/admin/catalogueSuggestions';
import { RESTRICTION_STAFF_LABELS } from '@/lib/shop/buyerRestriction';

const BADGE = { high: 'bg-green-100 text-green-900', medium: 'bg-amber-100 text-amber-900', low: 'bg-red-100 text-red-900' } as const;

/**
 * The fields "Use all suggested values" fills: only EMPTY fields (class / new-drug when they
 * differ), never cold chain — that is chosen explicitly (C-25) — and never a category or
 * HSN code that is not in the managed lists yet (create it first, Alt+C).
 */
export function applicablePatch(d: Draft): DraftPatch {
  const s = d.suggestion;
  if (!s) return {};
  const flagged = new Set(s.flags.filter((f) => f.field !== 'gst_rate').map((f) => f.field));
  const out: DraftPatch = {};
  const empty = (k: keyof Draft) => d[k] === null || d[k] === undefined || d[k] === '';
  for (const k of ['drug_schedule', 'generic_name', 'strength', 'dosage_form', 'category', 'hsn_code', 'gst_rate'] as const) {
    const v = s.suggested[k];
    if (v === undefined || v === null || !empty(k) || flagged.has(k as 'category' | 'hsn_code')) continue;
    (out as Record<string, unknown>)[k] = v;
  }
  if ((s.suggested.product_class !== undefined && s.suggested.product_class !== d.product_class)
    || (s.suggested.is_new_drug !== undefined && s.suggested.is_new_drug !== !!d.is_new_drug)) {
    out.product_class = s.suggested.product_class ?? d.product_class;
    out.is_new_drug = s.suggested.is_new_drug ?? !!d.is_new_drug;
  }
  return out;
}

/** Sprint 46 — the imported suggestion for one draft: who, how sure, the note, the values; never a decision (C-19). */
export default function SuggestionPanel({ draft, onSave, disabled }: { draft: Draft; onSave: (p: DraftPatch) => void; disabled?: boolean }) {
  const s = draft.suggestion;
  if (!s) return null;
  const patch = applicablePatch(draft);
  const count = Object.keys(patch).length;
  const keys = SUGGESTED_FIELDS.filter((f) => s.suggested[f.key] !== undefined);
  const decided = (k: SuggestedKey) => (k === 'cold_chain' ? draft.cold_chain_decided : draft[k] !== null && draft[k] !== undefined);
  return (
    <section role="note" aria-label="Suggested details" data-testid="draft-suggestion"
      className="mb-3 rounded-lg border-2 border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
      <div className="flex flex-wrap items-center gap-2">
        <Lightbulb className="w-4 h-4 shrink-0" aria-hidden="true" />
        <p className="font-semibold text-sm">Suggested — check against the pack</p>
        <span className={`rounded-full px-2 py-0.5 font-medium ${BADGE[s.confidence]}`} data-testid="suggestion-confidence">{CONFIDENCE_LABEL[s.confidence]}</span>
      </div>
      <p className="mt-1">
        Prepared outside Dawabag{s.partner_name ? ` for ${s.partner_name}'s item` : ''} {[s.item_name, s.pack, s.company].filter(Boolean).join(' · ')}.
        {' '}Imported {formatDateTimeIST(s.imported_at)}{s.imported_by_name ? ` by ${s.imported_by_name}` : ''}. Nothing is decided until you save it and approve.
      </p>
      {s.note && <p className="mt-1" data-testid="suggestion-note"><strong>Note:</strong> {s.note}</p>}
      {s.flags.map((f) => <p key={f.field} className="mt-1 text-amber-900 font-medium">{f.message}</p>)}
      <dl className="mt-2 grid grid-cols-2 sm:grid-cols-5 gap-x-3 gap-y-1">
        {keys.map((f) => (
          <div key={f.key}>
            <dt className="text-amber-800">{f.label}</dt>
            <dd className="font-medium">{showSuggested(f.key, s.suggested[f.key])}{decided(f.key) ? <span className="font-normal text-amber-800"> (decided)</span> : null}</dd>
          </div>
        ))}
      </dl>
      {/* Sprint 47: who may buy it — decided with a reason in the approval step below, never by "Use" */}
      {s.suggested.buyer_restriction && s.suggested.buyer_restriction !== 'everyone' && (
        <p className="mt-1" data-testid="suggestion-buyer-restriction">
          <strong>Who may buy:</strong> {RESTRICTION_STAFF_LABELS[s.suggested.buyer_restriction]} — choose it yourself, with a reason, when you approve.
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-outline text-xs py-1 px-2 bg-white" disabled={disabled || count === 0} onClick={() => onSave(patch)}>
          Use the suggested values I have checked ({count})
        </button>
        {s.suggested.cold_chain !== undefined && !draft.cold_chain_decided && (
          <span>Cold chain: choose it yourself in the form (C-25).</span>
        )}
      </div>
    </section>
  );
}
