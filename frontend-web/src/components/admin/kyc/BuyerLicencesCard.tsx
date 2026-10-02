'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { KycApplication } from '@/lib/admin/kyc';
import { kycKeys } from '@/lib/admin/kyc';
import { saveBuyerLicences } from '@/lib/licences/api';
import { blankLicence, draftFromView, licenceBodies, licenceProblems, type LicenceView, type Party } from '@/lib/licences/forms';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { todayIST } from '@/lib/dates';
import LicenceList from '@/components/licences/LicenceList';
import LicenceRowsEditor from '@/components/licences/LicenceRowsEditor';
import LicenceDocumentButton from '@/components/licences/LicenceDocumentButton';
import LicenceDecisionDialog from '@/components/licences/LicenceDecisionDialog';

const PARTY: Record<string, Party> = { b2b_retailer: 'retailer', b2b_wholesaler: 'wholesaler', doc_hospital: 'doctor' };
const SUGGESTED: Record<string, ('dl20' | 'dl21' | 'dl20b' | 'dl21b')[]> = {
  b2b_retailer: ['dl20', 'dl21'], b2b_wholesaler: ['dl20b', 'dl21b'], doc_hospital: ['dl20', 'dl21'],
};

/**
 * Every drug licence of a business or doctor account (C-11): checked, waiting and not
 * accepted ones, each checked on its own. The reviewer may also enter or correct the list
 * as checked on the licensing authority's record (dates required).
 */
export default function BuyerLicencesCard({ application }: { application: KycApplication }) {
  const { user } = application;
  const qc = useQueryClient();
  const today = todayIST();
  const party = PARTY[user.customer_type] ?? 'doctor';
  const [checking, setChecking] = useState<LicenceView | null>(null);
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState(() => {
    const current = application.licences.filter((l) => l.status === 'verified' || l.status === 'pending');
    return current.length ? current.map(draftFromView) : [blankLicence(SUGGESTED[user.customer_type]?.[0] ?? '')];
  });
  const [problems, setProblems] = useState<string[]>([]);
  const refresh = [kycKeys.application(user.id), ['admin', 'kyc']] as const;
  const save = useMutation({
    mutationFn: () => saveBuyerLicences(user.id, licenceBodies(rows)),
    onSuccess: (r) => {
      toast.success(r.account_activated ? 'Licences saved — account is active' : 'Licences saved as checked');
      setEditing(false);
      refresh.forEach((k) => qc.invalidateQueries({ queryKey: k }));
    },
    onError: (err) => setProblems([getApiErrorMessage(err, 'Could not save the licences')]),
  });
  const submit = () => {
    const p = licenceProblems(rows, { party, today, requireValidUpto: true });
    setProblems(p);
    if (!p.length) save.mutate();
  };

  return (
    <div className="card" aria-label="Drug licences">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold">Drug licences ({application.licences.length})</h3>
        {!editing && (
          <button type="button" className="btn-outline text-xs py-1 px-2" onClick={() => setEditing(true)}>Enter or correct licences</button>
        )}
      </div>
      <LicenceList licences={application.licences} empty="No drug licence given" label="Buyer drug licences"
        actions={(l) => (l.id ? (
          <>
            {l.has_document && <LicenceDocumentButton licenceId={l.id} where="admin" />}
            {l.status === 'pending' && (
              <button type="button" className="btn-primary text-xs py-1 px-2" onClick={() => setChecking(l)}>Check</button>
            )}
          </>
        ) : null)} />
      {application.replaced_licences.length > 0 && (
        <details className="mt-2 text-xs text-gray-600">
          <summary className="cursor-pointer">Replaced licences ({application.replaced_licences.length})</summary>
          <LicenceList licences={application.replaced_licences} compact label="Replaced buyer licences" />
        </details>
      )}
      {editing && (
        <div className="mt-3 border-t border-gray-100 pt-3 text-sm space-y-3">
          <p className="text-xs text-gray-500">Saved as checked by you. Forms left out are kept as replaced (history).</p>
          <LicenceRowsEditor rows={rows} onChange={setRows} today={today} suggested={SUGGESTED[user.customer_type] ?? []} showDetails idPrefix="kyc-licence" />
          {problems.length > 0 && <ul role="alert" className="text-xs text-red-700 list-disc pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-outline text-sm" onClick={() => { setEditing(false); setProblems([]); }}>Cancel</button>
            <button type="button" className="btn-primary text-sm" disabled={save.isPending} onClick={submit}>Save as checked</button>
          </div>
        </div>
      )}
      {checking && (
        <LicenceDecisionDialog licence={checking} partyName={user.business_name || user.full_name} onClose={() => setChecking(null)} refresh={refresh} />
      )}
    </div>
  );
}
