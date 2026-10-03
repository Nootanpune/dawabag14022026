import { AlertTriangle } from 'lucide-react';
import type { ImportMeta } from '@/lib/medicineInfo/types';

/**
 * Sprint 45 — shown on a version imported from a drafts file (written outside Dawabag).
 * The pharmacist must check every line against the pack insert before sending it; a
 * second registered pharmacist approves (C-19). Staff only — buyers never see it.
 */
export default function ImportedDraftBanner({ meta, partner, compact = false }: { meta: ImportMeta | null | undefined; partner?: string | null; compact?: boolean }) {
  if (!meta) return null;
  return (
    <div role="note" data-testid="imported-draft-banner"
      className={`rounded-lg border-2 border-yellow-400 bg-yellow-50 text-yellow-950 ${compact ? 'p-2 text-xs' : 'p-3 text-sm'}`}>
      <p className="font-semibold flex items-start gap-1.5">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
        <span>Imported draft — written outside Dawabag. Check every line against the pack insert.</span>
      </p>
      <p className="mt-1">
        Assumed composition: <strong>{meta.assumed_composition}</strong> (confidence <strong>{meta.composition_confidence}</strong>).
        {meta.drafting_note ? <> Note: {meta.drafting_note}</> : null}
      </p>
      {!compact && (meta.item_name || partner) && (
        <p className="mt-1 text-xs text-yellow-900">
          Matched from {partner ? `${partner}'s` : 'the partner’s'} item {[meta.item_name, meta.pack, meta.company].filter(Boolean).join(' · ')}.
          A registered pharmacist must check and send it; a second registered pharmacist approves it.
        </p>
      )}
    </div>
  );
}
