'use client';
import { useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { hsnGstNote, hsnLabel, tidyHsn } from '@/lib/catalogueLists';
import SearchableSelect from './SearchableSelect';
import QuickCreateArea, { NewButton } from './QuickCreateArea';
import NewHsnDialog from './NewHsnDialog';
import { useHsnList } from './useCatalogueLists';

/**
 * HSN code: searched by code or words in the server's list; Alt+C or "+ New" adds one.
 * `suggested` is the partner file's code ("use the file's HSN"): chosen if listed,
 * otherwise offered to add. The product's GST is never changed: a differing usual
 * rate only shows a note (unless the page shows its own warning: showGstNote=false).
 */
export default function HsnPicker({ id, value, onChange, disabled, productGst, suggested, showGstNote = true, hint, label = 'HSN code' }: {
  id: string;
  value: string | null;
  onChange: (code: string | null) => void;
  disabled?: boolean;
  productGst?: number | string | null;
  suggested?: { code: string; gst_rate: number | null } | null;
  showGstNote?: boolean;
  hint?: ReactNode;
  label?: string;
}) {
  const refocus = () => window.setTimeout(() => document.getElementById(id)?.focus(), 0);
  const list = useHsnList();
  const typed = useRef('');
  const [dialog, setDialog] = useState<{ code?: string; gst_rate?: number | null } | null>(null);
  const codes = list.data ?? [];
  const options = codes.map((h) => ({ value: h.code, label: hsnLabel(h), search: h.code }));
  const current = codes.find((h) => h.code === value);
  const note = showGstNote ? hsnGstNote(current, productGst) : null;
  const fromTyped = () => { const t = tidyHsn(typed.current); return /^\d+$/.test(t) ? { code: t } : {}; };

  const useSuggested = () => {
    if (!suggested) return;
    if (codes.some((h) => h.code === suggested.code)) onChange(suggested.code);
    else setDialog({ code: suggested.code, gst_rate: suggested.gst_rate });
  };
  const suggestedListed = !!suggested && codes.some((h) => h.code === suggested.code);

  return (
    <QuickCreateArea onQuickCreate={() => setDialog(fromTyped())} disabled={disabled}>
      <SearchableSelect id={id} label={label} value={value ?? ''} options={options} onChange={onChange} disabled={disabled}
        placeholder={list.isLoading ? 'Loading…' : 'Code or words'}
        onTyped={(t) => { typed.current = t; }}
        notFoundHint="Not in the list: press Alt+C or “+ New” to add it"
        onAddTyped={(t) => setDialog(/^[\d\s.]+$/.test(t) ? { code: tidyHsn(t) } : {})}
        addLabel={(t) => `+ Add a new HSN code${/^[\d\s.]+$/.test(t) ? ` ${tidyHsn(t)}` : ''}`}
        hint={suggested && suggested.code !== value ? (
          <>File says {suggested.code}{' '}
            <button type="button" className="underline" onClick={useSuggested} disabled={disabled}>
              {suggestedListed ? 'use it' : 'add it to the list and use it'}
            </button></>
        ) : hint}
        after={<NewButton what="HSN code" onClick={() => setDialog(fromTyped())} disabled={disabled} />} />
      {note && <p className="text-[11px] text-amber-800 mt-0.5" role="status">{note}</p>}
      {dialog !== null && (
        <NewHsnDialog initial={dialog} list={codes} onClose={() => { setDialog(null); refocus(); }}
          onDone={(code, n) => {
            setDialog(null);
            typed.current = '';
            refocus();
            toast.success(n ?? `HSN ${code} added and chosen`);
            if (code !== value) onChange(code);
          }} />
      )}
    </QuickCreateArea>
  );
}
