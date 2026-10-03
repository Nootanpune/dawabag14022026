'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import QueryState from '@/components/admin/QueryState';
import ReasonDialog from '@/components/admin/ReasonDialog';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { formatDateTimeIST } from '@/lib/dates';
import { API_BASE } from '@/lib/session';
import { apiKeyKeys, feedUrl, fetchApiKeys, revokeApiKey, type KeyOwner, type PartnerApiKey } from '@/lib/partnerApiKeys';
import NewKeyDialog from './NewKeyDialog';

/**
 * Sprint 36 — "Automatic stock upload": the partner's billing software sends its stock
 * file with an API key; it lands as a draft import for the partner to review and apply.
 * Admins see this on the partner's page; the partner's owner login in the portal.
 */
export default function ApiKeysPanel({ owner, partnerId }: { owner: KeyOwner; partnerId?: string }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [revoking, setRevoking] = useState<PartnerApiKey | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: apiKeyKeys.list(owner), queryFn: () => fetchApiKeys(owner), retry: false });
  const revoke = useMutation({
    mutationFn: ({ k, reason }: { k: PartnerApiKey; reason: string }) => revokeApiKey(owner, k.id, reason),
    onSuccess: (r) => { toast.success(`Key ${r.key.masked} revoked`); setRevoking(null); qc.invalidateQueries({ queryKey: apiKeyKeys.list(owner) }); },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Could not revoke the key')),
  });
  const pid = partnerId ?? data?.[0]?.partner_id;
  return (
    <section className="card space-y-3" aria-labelledby="api-keys-heading" data-testid="api-keys-panel">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="api-keys-heading" className="text-base font-semibold">Automatic stock upload (API keys)</h2>
          <p className="text-xs text-gray-500 max-w-xl">
            The billing software can send the same stock report by itself. Each upload waits here as a draft to review and apply.
            A key can only upload stock files for this partner; revoke it when a computer is replaced.
          </p>
          {pid && <p className="text-xs text-gray-500 mt-1 break-all">Address: <code>{feedUrl(API_BASE, pid)}</code></p>}
        </div>
        <button type="button" className="btn-primary text-sm" onClick={() => setAdding(true)}>New key</button>
      </div>
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No API keys yet" />
      {!!data?.length && (
        <ul className="divide-y divide-gray-100 border rounded-lg" data-testid="api-key-list">
          {data.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm" data-testid="api-key-row">
              <div className="flex-1 min-w-[14rem]">
                <p className={k.active ? 'font-medium' : 'font-medium text-gray-500 line-through'}>{k.label} <code className="text-xs font-normal">{k.masked}</code></p>
                <p className="text-xs text-gray-500">
                  Issued {formatDateTimeIST(k.created_at)}{k.created_by_name ? ` by ${k.created_by_name}` : ''}
                  {' · '}{k.last_used_at ? `last used ${formatDateTimeIST(k.last_used_at)} (${k.use_count}×)` : 'never used'}
                  {k.revoked_at && ` · revoked ${formatDateTimeIST(k.revoked_at)}${k.revoke_reason ? ` (${k.revoke_reason})` : ''}`}
                </p>
              </div>
              {k.active && (
                <button type="button" className="text-sm text-red-700 font-medium hover:underline" onClick={() => setRevoking(k)}
                  aria-label={`Revoke key ${k.label}`}>Revoke</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {adding && <NewKeyDialog owner={owner} onClose={() => setAdding(false)} />}
      {revoking && (
        <ReasonDialog title={`Revoke "${revoking.label}"?`} label="Why (e.g. PC replaced)" confirmLabel="Revoke key" minLength={3}
          pending={revoke.isPending} onClose={() => setRevoking(null)} onConfirm={(reason) => revoke.mutate({ k: revoking, reason })} />
      )}
    </section>
  );
}
