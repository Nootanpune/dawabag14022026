'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { OnlineSaleChange } from '@/lib/onlineSale/api';
import { getApiErrorMessage } from '@/lib/apiErrors';
import {
  approveDraft, bulkSetDrafts, draftKeys, rejectDraft, saveDraft, saveDraftDescription, type BulkKey, type Draft, type DraftList, type DraftPatch,
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
    mutationFn: ({ notes, onlineSale }: { notes?: string; onlineSale?: OnlineSaleChange }) => approveDraft(draftId, notes, onlineSale),
    onSuccess: (r) => {
      toast.success(r.status === 'not_listed' ? 'Approved as never sold online (C-10)'
        : r.sellable ? 'Approved: in the catalogue and allowed online' : 'Approved: in the catalogue, not allowed online yet');
      refreshAll();
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Could not approve')),
  });
  const reject = useMutation({
    mutationFn: (reason: string) => rejectDraft(draftId, reason),
    onSuccess: () => { toast.success('Closed: not listed'); refreshAll(); },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Could not close it')),
  });
  const describe = useMutation({
    mutationFn: (description: string | null) => saveDraftDescription(draftId, description),
    onSuccess: (d) => {
      replace(d);
      toast.success(d.status === 'open' ? 'Description saved'
        : 'Description saved: buyers see it once a pharmacist approves it in Product copy (C-19)');
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Could not save the description')),
  });
  return { save, approve, reject, describe };
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
