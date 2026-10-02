'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QueryState from '@/components/admin/QueryState';
import type { Category } from '@/lib/catalogueLists';
import { fetchAllCategories, manageKeys, updateCategory, usedByText } from '@/lib/admin/catalogueListsAdmin';
import { getApiErrorMessage } from '@/lib/apiErrors';
import ListSearch from './ListSearch';
import ActiveBadge from './ActiveBadge';
import ActiveToggleButton from './ActiveToggleButton';
import RenameCategoryDialog from './RenameCategoryDialog';

/** Categories: search, rename (products follow), switch off / on. Read-only for pharmacists. */
export default function CategoriesTab({ canEdit, onMessage }: { canEdit: boolean; onMessage: (m: { ok: boolean; text: string }) => void }) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [renaming, setRenaming] = useState<Category | null>(null);
  const { data = [], isLoading, error } = useQuery({ queryKey: manageKeys.categories(q), queryFn: () => fetchAllCategories(q), placeholderData: (prev) => prev });
  const toggle = useMutation({
    mutationFn: (c: Category) => updateCategory(c.id, { is_active: !c.is_active }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['catalogue-lists'] });
      onMessage({ ok: true, text: r.category.is_active
        ? `"${r.category.name}" is back in the pick-lists`
        : `"${r.category.name}" is switched off — products that have it keep it` });
    },
    onError: (e) => onMessage({ ok: false, text: getApiErrorMessage(e, 'Could not change the category') }),
  });
  return (
    <section aria-label="Categories">
      <ListSearch value={q} onChange={setQ} label="Search categories" />
      <QueryState isLoading={isLoading} error={error} isEmpty={!isLoading && data.length === 0} emptyText={q ? 'No category matches' : 'No categories yet'} />
      {data.length > 0 && (
        <ul className="divide-y divide-gray-100 card p-0" data-testid="category-list">
          {data.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3" data-testid="category-row">
              <div className="flex-1 min-w-[12rem]">
                <p className={`font-medium ${c.is_active ? 'text-gray-900' : 'text-gray-500'}`}>{c.name}</p>
                <p className="text-xs text-gray-500">{usedByText(c.product_count)}</p>
              </div>
              <ActiveBadge active={c.is_active} />
              {canEdit && (
                <div className="flex items-center gap-4">
                  <button type="button" className="text-sm text-brand-700 font-medium hover:underline underline-offset-2"
                    onClick={() => setRenaming(c)} aria-label={`Rename ${c.name}`}>Rename</button>
                  <ActiveToggleButton active={c.is_active} name={c.name}
                    pending={toggle.isPending && toggle.variables?.id === c.id} onClick={() => toggle.mutate(c)} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {renaming && (
        <RenameCategoryDialog category={renaming} onClose={() => setRenaming(null)}
          onDone={(text) => { setRenaming(null); onMessage({ ok: true, text }); }} />
      )}
    </section>
  );
}
