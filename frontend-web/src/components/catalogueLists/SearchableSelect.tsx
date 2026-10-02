'use client';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  /** extra words matched by the search (e.g. an HSN code's description) */
  search?: string;
}

/**
 * A text box that searches a list and only accepts an entry of it (ARIA combobox).
 * Type to filter, ↑/↓ to move, Enter to choose, Esc to close. Leaving the box with
 * text that matches an entry chooses it; other text is put back and a hint says how
 * to add a new entry. Clearing the box clears the choice.
 */
export default function SearchableSelect({
  id, label, value, options, onChange, disabled, placeholder, hint, notFoundHint, onAddTyped, addLabel, after, onTyped,
}: {
  id: string;
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  hint?: ReactNode;
  /** shown when typed text is not in the list */
  notFoundHint: string;
  /** offers "Add “typed”…" at the end of the list */
  onAddTyped?: (typed: string) => void;
  addLabel?: (typed: string) => string;
  /** e.g. the "+ New" button, beside the box */
  after?: ReactNode;
  /** the text typed so far (to start a new entry from it) */
  onTyped?: (typed: string) => void;
}) {
  const selected = options.find((o) => o.value === value);
  const shown = selected?.label ?? value;
  const [text, setText] = useState(shown);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [missing, setMissing] = useState(false);
  const listId = useId();
  const chosen = useRef<string | null>(null);   // chosen but not yet saved: never sent twice
  useEffect(() => { if (!open) setText(shown); }, [shown, open]);
  useEffect(() => { chosen.current = null; setMissing(false); }, [value]);

  const typed = text.trim();
  const filtered = useMemo(() => {
    if (!typed || typed === shown) return options.slice(0, 50);
    const words = typed.toLowerCase().split(/\s+/);
    return options.filter((o) => words.every((w) => `${o.label} ${o.search ?? ''}`.toLowerCase().includes(w))).slice(0, 50);
  }, [options, typed, shown]);
  const exact = (t: string) => options.find((o) => o.value.toLowerCase() === t.toLowerCase() || o.label.toLowerCase() === t.toLowerCase());
  const offerAdd = !!onAddTyped && !!typed && typed !== shown && !exact(typed);
  const count = filtered.length + (offerAdd ? 1 : 0);

  const choose = (o: SelectOption) => {
    setOpen(false);
    setMissing(false);
    setText(o.label);
    if (o.value !== value && o.value !== chosen.current) { chosen.current = o.value; onChange(o.value); }
  };
  const commit = () => {
    setOpen(false);
    if (!typed) { setMissing(false); if (value) onChange(null); return; }
    if (typed === shown) return;
    const hit = exact(typed);
    if (hit) { choose(hit); return; }
    setMissing(true);
    setText(shown);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, count - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Escape') { if (open) { e.stopPropagation(); setOpen(false); setText(shown); } }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && active < filtered.length && filtered[active]) choose(filtered[active]);
      else if (open && offerAdd && active === filtered.length) { setOpen(false); onAddTyped!(typed); }
      else commit();
    }
  };

  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-gray-700 mb-0.5">{label}</label>
      <div className="flex gap-1 items-start">
        <div className="relative flex-1 min-w-0">
          <input
            id={id} value={text} disabled={disabled} placeholder={placeholder ?? 'Type to search'}
            role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" autoComplete="off"
            aria-activedescendant={open && count ? `${listId}-${active}` : undefined}
            onChange={(e) => { setText(e.target.value); onTyped?.(e.target.value); setOpen(true); setActive(0); setMissing(false); }}
            onClick={() => setOpen(true)}
            onBlur={() => window.setTimeout(commit, 120)}
            onKeyDown={onKey}
            className="input text-sm py-1.5"
          />
          {open && !disabled && (
            <ul id={listId} role="listbox" aria-label={label}
              className="absolute z-30 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg text-sm">
              {filtered.map((o, i) => (
                <li key={o.value} id={`${listId}-${i}`} role="option" aria-selected={o.value === value}
                  onMouseDown={(e) => { e.preventDefault(); choose(o); }}
                  className={`px-2 py-1.5 cursor-pointer ${i === active ? 'bg-brand-50' : ''} ${o.value === value ? 'font-medium' : ''}`}>
                  {o.label}
                </li>
              ))}
              {offerAdd && (
                <li id={`${listId}-${filtered.length}`} role="option" aria-selected={false}
                  onMouseDown={(e) => { e.preventDefault(); setOpen(false); onAddTyped!(typed); }}
                  className={`px-2 py-1.5 cursor-pointer text-brand-700 ${active === filtered.length ? 'bg-brand-50' : ''}`}>
                  {addLabel ? addLabel(typed) : `Add “${typed}”…`}
                </li>
              )}
              {!count && <li className="px-2 py-1.5 text-gray-500">Nothing matches</li>}
            </ul>
          )}
        </div>
        {after}
      </div>
      {missing ? <p className="text-[11px] text-amber-800 mt-0.5" role="status">{notFoundHint}</p>
        : hint ? <div className="text-[11px] text-gray-500 mt-0.5">{hint}</div> : null}
    </div>
  );
}
