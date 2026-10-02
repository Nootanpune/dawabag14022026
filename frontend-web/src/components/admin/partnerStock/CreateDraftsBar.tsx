'use client';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { createDrafts, type DraftsCreated } from '@/lib/admin/catalogueDrafts';

interface Props {
  selectedIds: string[];
  openCount: number;
  allChosen: boolean;
  onToggleAll: () => void;
  /** the server's answer, shown by the page (the list may empty out) */
  onDone: (result: DraftsCreated) => void;
}

/** "Create drafts" for the chosen requests, or for every open request (Sprint 29). */
export default function CreateDraftsBar({ selectedIds, openCount, allChosen, onToggleAll, onDone }: Props) {
  const create = useMutation({
    mutationFn: (ids: string[] | null) => createDrafts(ids),
    onSuccess: (r) => onDone(r),
    onError: (e) => toast.error(getApiErrorMessage(e, 'Could not create drafts')),
  });

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3" role="group" aria-label="Create drafts">
      <label className="inline-flex items-center gap-2 text-sm text-gray-700 mr-2">
        <input type="checkbox" checked={allChosen} onChange={onToggleAll} className="w-4 h-4" /> Choose all
      </label>
      <button type="button" disabled={!selectedIds.length || create.isPending} onClick={() => create.mutate(selectedIds)}
        className="btn-primary text-sm py-1.5 px-3 inline-flex items-center gap-1 disabled:opacity-50">
        {create.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
        Create drafts{selectedIds.length ? ` (${selectedIds.length})` : ''}
      </button>
      <button type="button" disabled={!openCount || create.isPending} onClick={() => create.mutate(null)}
        className="btn-outline text-sm py-1.5 px-3 disabled:opacity-50">
        Create drafts for all open requests
      </button>
    </div>
  );
}
