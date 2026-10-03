'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/api';
import { disableTwoFactor, fetchTwoFactorStatus, renewRecoveryCodes, twoFactorKeys, type SessionWithCodes } from '@/lib/auth/twoFactor';
import { formatDateTimeIST } from '@/lib/dates';
import { useAuthStore } from '@/store/authStore';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import EnrolPanel from './EnrolPanel';
import RecoveryCodes from './RecoveryCodes';
import PasswordAndCodeDialog from './PasswordAndCodeDialog';

type Dialog = 'disable' | 'codes' | null;

/**
 * A staff or partner login's own two-step sign-in (Sprint 42): switch it on with an
 * authenticator app, make new recovery codes, switch it off where it is optional.
 */
export default function TwoFactorSettings() {
  const qc = useQueryClient();
  const login = useAuthStore((s) => s.login);
  const { data, isLoading, error, refetch, isFetching } = useQuery({ queryKey: twoFactorKeys.status, queryFn: fetchTwoFactorStatus });
  const [enrolling, setEnrolling] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const enrolled = (s: SessionWithCodes) => {
    // The confirmation opened a two-step session (new cookie): use it from now on
    const { recovery_codes, ...session } = s;
    login(session);
    setEnrolling(false);
    setCodes(recovery_codes);
    toast.success('Two-step sign-in is on');
    qc.invalidateQueries({ queryKey: twoFactorKeys.status });
  };

  const confirmDialog = async (password: string, code: string) => {
    setPending(true);
    setDialogError(null);
    try {
      if (dialog === 'disable') {
        await disableTwoFactor(password, code);
        toast.success('Two-step sign-in is off');
      } else {
        setCodes(await renewRecoveryCodes(password, code));
      }
      setDialog(null);
      qc.invalidateQueries({ queryKey: twoFactorKeys.status });
    } catch (err) {
      setDialogError(getApiErrorMessage(err, 'That did not work'));
    } finally { setPending(false); }
  };

  return (
    <div className="max-w-2xl">
      <PageHeader title="Two-step sign-in" subtitle="Your password plus a code from an authenticator app on your phone"
        onRefresh={() => refetch()} refreshing={isFetching} />
      <QueryState isLoading={isLoading} error={error} isEmpty={!data} emptyText="Not available" />
      {data && !data.applies && <p className="text-sm text-gray-600">Two-step sign-in is for Dawabag staff and partner logins.</p>}
      {data?.applies && (
        <div className="card p-5 space-y-4">
          {codes ? (
            <RecoveryCodes codes={codes} onDone={() => setCodes(null)} doneLabel="Done" />
          ) : enrolling ? (
            <>
              <EnrolPanel onEnrolled={enrolled} />
              <button type="button" onClick={() => setEnrolling(false)} className="w-full text-sm text-gray-600 hover:text-brand-700">Cancel</button>
            </>
          ) : data.enrolled ? (
            <>
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-6 h-6 text-brand-700 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-semibold text-gray-900" data-testid="two-factor-state">Two-step sign-in is on</p>
                  <p className="text-sm text-gray-600">
                    Since {formatDateTimeIST(data.confirmed_at)}. Recovery codes left: {data.recovery_codes_left} of {data.recovery_codes_total}.
                  </p>
                  {data.required && <p className="text-sm text-gray-600 mt-1">It is required for your login and cannot be switched off.</p>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => { setDialogError(null); setDialog('codes'); }} className="btn-outline text-sm">New recovery codes</button>
                {data.may_disable && (
                  <button type="button" onClick={() => { setDialogError(null); setDialog('disable'); }}
                    className="text-sm px-4 py-2 rounded-lg border border-red-300 text-red-700 hover:bg-red-50">Switch off</button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start gap-3">
                <ShieldAlert className="w-6 h-6 text-amber-600 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-semibold text-gray-900" data-testid="two-factor-state">Two-step sign-in is off</p>
                  <p className="text-sm text-gray-600">
                    With it on, a stolen password — or a text-message code from a swapped SIM — is not enough to sign in as you.
                    {data.required ? ' It is required for your login: you will be asked to set it up at your next sign-in.' : ''}
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setEnrolling(true)} className="btn-primary text-sm">Set up an authenticator app</button>
            </>
          )}
        </div>
      )}
      {dialog && (
        <PasswordAndCodeDialog
          title={dialog === 'disable' ? 'Switch off two-step sign-in' : 'New recovery codes'}
          intro={dialog === 'disable'
            ? 'Your sign-in will need only your password again.'
            : 'Ten new codes replace the old ones, which stop working at once.'}
          confirmLabel={dialog === 'disable' ? 'Switch off' : 'Make new codes'} danger={dialog === 'disable'}
          pending={pending} error={dialogError} onClose={() => setDialog(null)} onConfirm={confirmDialog} />
      )}
    </div>
  );
}
