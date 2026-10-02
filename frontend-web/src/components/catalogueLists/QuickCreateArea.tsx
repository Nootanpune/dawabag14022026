'use client';
import type { ReactNode } from 'react';
import { isQuickCreateKey } from '@/lib/catalogueLists';

/**
 * Alt+C (Option+C on a Mac) inside this field — the box, its list or its "+ New"
 * button — opens the field's "New …" dialog. Anywhere else the key does what the
 * browser normally does; it is only taken over when our dialog opens.
 */
export default function QuickCreateArea({ onQuickCreate, disabled, children, className }: {
  onQuickCreate: () => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className} onKeyDown={(e) => {
      if (disabled || !isQuickCreateKey(e)) return;
      if ((e.target as HTMLElement).closest('[role="dialog"]')) return;   // typing inside our own dialog
      e.preventDefault();
      e.stopPropagation();
      onQuickCreate();
    }}>
      {children}
    </div>
  );
}

/** The visible way in (phones, mouse): "+ New", with the shortcut in its tooltip. */
export function NewButton({ what, onClick, disabled }: { what: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={`New ${what} (Alt+C)`} aria-keyshortcuts="Alt+C"
      className="btn-outline text-xs py-1.5 px-2 whitespace-nowrap shrink-0 disabled:opacity-50">
      + New<span className="sr-only"> {what}</span>
    </button>
  );
}

/** The page's small keyboard help. */
export function QuickCreateHint() {
  const k = 'px-1 py-0.5 rounded border border-gray-300 bg-gray-50 font-mono text-[11px]';
  return (
    <p className="text-xs text-gray-500" data-testid="quick-create-hint">
      Keyboard: in <strong>Category</strong> or <strong>HSN code</strong>, press <kbd className={k}>Alt</kbd>+<kbd className={k}>C</kbd>{' '}
      (<kbd className={k}>Option</kbd>+<kbd className={k}>C</kbd> on a Mac) to add a new one. Or use “+ New”.
    </p>
  );
}
