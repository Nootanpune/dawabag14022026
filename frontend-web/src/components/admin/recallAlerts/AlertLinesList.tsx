'use client';
import { useState } from 'react';
import type { AlertLine, AlertMatch } from '@/lib/recallAlerts/types';
import AlertLineCard from './AlertLineCard';
import RecallMatchDialog from './RecallMatchDialog';
import ClearMatchDialog from './ClearMatchDialog';
import ClearLineProductDialog from './ClearLineProductDialog';

type Open =
  | { kind: 'recall' | 'clear'; line: AlertLine; match: AlertMatch }
  | { kind: 'clearProduct'; line: AlertLine }
  | null;

/** Alert lines (matched first, as the server orders them) with their decision dialogs (C-28). */
export default function AlertLinesList({ lines }: { lines: AlertLine[] }) {
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);
  const unmatched = lines.filter((l) => !l.matches.length).length;

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        {lines.length - unmatched} line(s) found in our stock or sales · {unmatched} not held
      </p>
      {lines.map((l) => (
        <AlertLineCard
          key={l.id}
          line={l}
          onRecall={(m) => setOpen({ kind: 'recall', line: l, match: m })}
          onClear={(m) => setOpen({ kind: 'clear', line: l, match: m })}
          onClearProduct={() => setOpen({ kind: 'clearProduct', line: l })}
        />
      ))}
      {open?.kind === 'recall' && <RecallMatchDialog line={open.line} match={open.match} onClose={close} />}
      {open?.kind === 'clear' && <ClearMatchDialog line={open.line} match={open.match} onClose={close} />}
      {open?.kind === 'clearProduct' && <ClearLineProductDialog line={open.line} onClose={close} />}
    </div>
  );
}
