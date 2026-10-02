'use client';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';
import Modal from '@/components/admin/Modal';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { categoryNameProblem, findCategory, type Category } from '@/lib/catalogueLists';
import { useCreateCategory } from './useCatalogueLists';

/** "New category": saved to the server's list (audited), then chosen in the field. */
export default function NewCategoryDialog({ initial, list, onClose, onDone }: {
  initial: string;
  list: Category[];
  onClose: () => void;
  onDone: (name: string, note: string | null) => void;
}) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState('');
  const create = useCreateCategory();
  const existing = findCategory(list, name);

  const submit = () => {
    const problem = categoryNameProblem(name);
    if (problem) { setError(problem); return; }
    create.mutate(name, {
      onSuccess: (r) => onDone(r.value.name, r.note),
      onError: (e) => setError(getApiErrorMessage(e, 'Could not add the category')),
    });
  };

  // In a portal: the field may sit inside another form (product form, "Set for all chosen")
  return createPortal(
    <Modal title="New category" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); submit(); }} className="space-y-3">
        <div>
          <label htmlFor="new-category-name" className="block text-sm font-medium text-gray-700 mb-1">Category name</label>
          <input id="new-category-name" value={name} maxLength={60} autoFocus className="input"
            onChange={(e) => { setName(e.target.value); setError(''); }} />
          {existing ? (
            <p className="text-xs text-gray-600 mt-1">“{existing.name}” is already in the list: saving chooses it.</p>
          ) : (
            <p className="text-xs text-gray-500 mt-1">Short and plain, e.g. “Fever &amp; pain”. Everyone choosing a category will see it.</p>
          )}
          {error && <p className="text-xs text-red-600 mt-1" role="alert">{error}</p>}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-outline text-sm">Cancel</button>
          <button type="submit" disabled={create.isPending} className="btn-primary text-sm inline-flex items-center gap-1 disabled:opacity-50">
            {create.isPending && <Loader2 className="w-4 h-4 animate-spin" />} {existing ? 'Choose it' : 'Add and choose'}
          </button>
        </div>
      </form>
    </Modal>,
    document.body,
  );
}
