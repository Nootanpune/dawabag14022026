'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';
import type { Category } from '@/lib/catalogueLists';
import { categoryNameProblem, tidyName } from '@/lib/catalogueLists';
import { updateCategory, usedByText } from '@/lib/admin/catalogueListsAdmin';
import { getApiErrorMessage } from '@/lib/apiErrors';

/** Rename a category: every product under it is renamed with it, in one step (audited on the server). */
export default function RenameCategoryDialog({ category, onClose, onDone }: { category: Category; onClose: () => void; onDone: (msg: string) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(category.name);
  const [error, setError] = useState('');
  const save = useMutation({
    mutationFn: () => updateCategory(category.id, { name: tidyName(name) }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['catalogue-lists'] });
      onDone(`Renamed to "${r.category.name}"${r.products_updated ? ` — ${r.products_updated} product${r.products_updated === 1 ? '' : 's'} updated` : ''}`);
    },
    onError: (e) => setError(getApiErrorMessage(e, 'Could not rename the category')),
  });
  const submit = () => {
    const problem = categoryNameProblem(name) ?? (tidyName(name) === category.name ? 'Type the new name' : null);
    if (problem) { setError(problem); return; }
    setError('');
    save.mutate();
  };
  return (
    <Modal title={`Rename "${category.name}"`} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <label htmlFor="category-new-name" className="block text-sm font-medium text-gray-700 mb-1">New name</label>
        <input id="category-new-name" className="input w-full" value={name} maxLength={60} autoFocus
          onChange={(e) => setName(e.target.value)} />
        <p className="text-xs text-gray-500 mt-2">
          {usedByText(category.product_count)}. {category.product_count > 0 && 'They will show the new name in the shop and on the product form.'}
        </p>
        <DialogActions onCancel={onClose} onConfirm={submit} confirmLabel="Rename" pending={save.isPending} error={error} />
      </form>
    </Modal>
  );
}
