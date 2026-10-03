'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/api';
import { fetchTwoFactorOverview, resetTwoFactor, twoFactorKeys, type TwoFactorPerson } from '@/lib/auth/twoFactor';
import { formatDateTimeIST } from '@/lib/dates';
import { useAuthStore } from '@/store/authStore';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import ReasonDialog from '@/components/admin/ReasonDialog';

const ROLE_WORDS: Record<string, string> = {
  super_admin: 'Super admin', admin: 'Admin', pharmacist_rx: 'Pharmacist', pharmacist_pack: 'Packer', partner: 'Partner login',
};

/**
 * Admins: which staff and partner logins use two-step sign-in (Sprint 42). A super-admin
 * resets a lost authenticator, with a reason that goes to the audit log (C-46).
 */
export default function TwoFactorOverview() {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const isSuperAdmin = me?.role === 'super_admin';
  const { data, isLoading, error, refetch, isFetching } = useQuery({ queryKey: twoFactorKeys.overview, queryFn: fetchTwoFactorOverview });
  const [resetting, setResetting] = useState<TwoFactorPerson | null>(null);
  const reset = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => resetTwoFactor(id, reason),
    onSuccess: () => {
      toast.success('Two-step sign-in reset');
      setResetting(null);
      qc.invalidateQueries({ queryKey: twoFactorKeys.overview });
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not reset')),
  });
  const people = data?.people ?? [];
  const on = people.filter((p) => p.enrolled && p.is_active).length;
  const active = people.filter((p) => p.is_active).length;

  return (
    <div>
      <PageHeader title="Two-step sign-in"
        subtitle={data ? `${data.policy === 'required' ? 'Required' : 'Optional'} for staff and partner logins (Settings → "Two-step sign-in") · ${on} of ${active} active logins use it` : undefined}
        onRefresh={() => refetch()} refreshing={isFetching} />
      <QueryState isLoading={isLoading} error={error} isEmpty={!people.length} emptyText="No staff or partner logins" />
      {!!people.length && (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr><th className="px-4 py-2">Name</th><th className="px-4 py-2">Role</th><th className="px-4 py-2">Two-step sign-in</th>
                <th className="px-4 py-2">Recovery codes left</th><th className="px-4 py-2"><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {people.map((p) => (
                <tr key={p.user_id} className={p.is_active ? '' : 'text-gray-400'}>
                  <td className="px-4 py-2">{p.full_name}{p.partner_name ? <span className="text-gray-500"> · {p.partner_name}</span> : null}</td>
                  <td className="px-4 py-2">{ROLE_WORDS[p.role] ?? p.role}{p.is_active ? '' : ' (switched off)'}</td>
                  <td className="px-4 py-2">{p.enrolled ? `On since ${formatDateTimeIST(p.enrolled_at)}` : 'Off'}</td>
                  <td className="px-4 py-2">{p.enrolled ? p.recovery_codes_left : '—'}</td>
                  <td className="px-4 py-2 text-right">
                    {isSuperAdmin && p.enrolled && p.user_id !== me?.id && (
                      <button type="button" onClick={() => setResetting(p)} className="text-sm text-red-700 hover:underline">Reset</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {resetting && (
        <ReasonDialog title={`Reset two-step sign-in of ${resetting.full_name}`} minLength={10}
          label="Why (e.g. lost phone — identity checked by a call). Goes to the audit log."
          confirmLabel="Reset" pending={reset.isPending} onClose={() => setResetting(null)}
          onConfirm={(reason) => reset.mutate({ id: resetting.user_id, reason })} />
      )}
    </div>
  );
}
