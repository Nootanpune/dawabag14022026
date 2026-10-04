'use client';
import type { ReactNode } from 'react';

/**
 * Sprint 46 — under a field pre-filled from an imported suggestion: it is not saved (and
 * not a decision) until the person checks it against the pack and presses "Use" or
 * changes it (C-19).
 */
export default function SuggestedNote({ text, onUse, disabled, extra }: {
  text?: string;
  onUse?: () => void;
  disabled?: boolean;
  extra?: ReactNode;
}) {
  return (
    <span className="block text-[11px] text-amber-900 mt-0.5" data-testid="suggested-note">
      <span className="font-semibold">Suggested — check against the pack</span>
      {text ? <>: {text}</> : null}
      {onUse && (
        <>
          {' '}
          <button type="button" className="underline font-medium" onClick={onUse} disabled={disabled}>Use</button>
        </>
      )}
      {extra ? <span className="block">{extra}</span> : null}
    </span>
  );
}

/** Classes of a field showing a suggestion that is not saved yet. */
export const SUGGESTED_FIELD = 'border-amber-400 bg-amber-50';
