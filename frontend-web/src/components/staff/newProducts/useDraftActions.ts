'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/apiErrors';
import {
  approveDraft, bulkSetDrafts, draftKeys, rejectDraft, saveDraft, type BulkKey, type Draft, type DraftList, type DraftPatch,
} from '@/lib/admin/catalogueDrafts';

/** Save / approve / reject for one draft; the list is refreshed from the server's answer. */
export function useDraftActions(draftId: string) {
  const queryClient = useQueryClient();
  const refreshAll = () => queryClient.invalidateQueries({ queryKey: draftKeys.all });
  const replace = (d: Draft) => queryClient.setQueriesData<DraftList>({ queryKey: [...draftKeys.all, 'list'] }, (old) =>
    old ? { ...old, drafts: old.drafts.map((x) => (x.id === d.id ? d : x)) } : old);

  const save = useMutation({
    mutationFn: (patch: DraftPatch) => saveDraft(draftId, patch),
    onSuccess: replace,
    onError: (e) => toast.error(getApiErrorMessage(e, 'Could not save')),
  });
  const approve = useMutation({
    mutationFn: (notes?: string) => approveDraft(draftId, notes),
    onSuccess: (r) => {
      toast.success(r.sellable ? 'Approved: now in the catalogue' : 'Approved as never sold online (C-10)');
      refreshAll();
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Could not approve')),
  });
  const reject = useMutation({
    mutationFn: (reason: string) => rejectDraft(draftId, reason),
    onSuccess: () => { toast.success('Closed: not listed'); refreshAll(); },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Could not close it')),
  });
  return { save, approve, reject };
}

export function useBulkSet(onDone: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, key, value }: { ids: string[]; key: BulkKey; value: string | null }) => bulkSetDrafts(ids, { [key]: value }),
    onSuccess: (r) => {
      toast.success(`Set on ${r.updated} products`);
      queryClient.invalidateQueries({ queryKey: draftKeys.all });
      onDone();
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Could not set it')),
  });
}
