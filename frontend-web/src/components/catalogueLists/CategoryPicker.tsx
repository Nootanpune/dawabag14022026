'use client';
import { useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import SearchableSelect from './SearchableSelect';
import QuickCreateArea, { NewButton } from './QuickCreateArea';
import NewCategoryDialog from './NewCategoryDialog';
import { useCategoryList } from './useCatalogueLists';

/** Category: chosen from the server's list; Alt+C or "+ New" adds one and chooses it. */
export default function CategoryPicker({ id, value, onChange, disabled, label = 'Category', hint }: {
  id: string;
  value: string | null;
  onChange: (name: string | null) => void;
  disabled?: boolean;
  label?: string;
  hint?: ReactNode;
}) {
  const refocus = () => window.setTimeout(() => document.getElementById(id)?.focus(), 0);
  const list = useCategoryList();
  const typed = useRef('');
  const [dialog, setDialog] = useState<string | null>(null);
  const categories = list.data ?? [];
  const options = categories.map((c) => ({ value: c.name, label: c.name }));
  const openDialog = (start = typed.current) => setDialog(start);

  return (
    <QuickCreateArea onQuickCreate={() => openDialog()} disabled={disabled}>
      <SearchableSelect id={id} label={label} value={value ?? ''} options={options} onChange={onChange} disabled={disabled}
        placeholder={list.isLoading ? 'Loading…' : 'Type to search'} hint={hint}
        onTyped={(t) => { typed.current = t; }}
        notFoundHint="Not in the list: press Alt+C or “+ New” to add it"
        onAddTyped={(t) => openDialog(t)} addLabel={(t) => `+ Add “${t}” as a new category`}
        after={<NewButton what="category" onClick={() => openDialog()} disabled={disabled} />} />
      {dialog !== null && (
        <NewCategoryDialog initial={dialog} list={categories} onClose={() => { setDialog(null); refocus(); }}
          onDone={(name, note) => {
            setDialog(null);
            typed.current = '';
            refocus();
            toast.success(note ?? `Category “${name}” added and chosen`);
            if (name !== value) onChange(name);
          }} />
      )}
    </QuickCreateArea>
  );
}
