'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import { formatDateTimeIST } from '@/lib/dates';
import { fetchRegistrations, registrationKeys } from '@/lib/pharmacistRegistrations/api';
import StandingBadge from './StandingBadge';
import RegistrationDialog, { type RegistrationTarget } from './RegistrationDialog';

/**
 * Pharmacist registrations (Sprint 39, handover D10; C-03, C-08): Dawabag's pharmacists and
 * every partner's. A lapsed, expired, suspended or unverified registration cannot verify
 * prescriptions, check or release orders, or approve medicine information. Pharmacists who
 * worked before Sprint 39 carry on with a warning until their record is completed here.
 */
export default function RegistrationsPanel() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({ queryKey: registrationKeys.all, queryFn: fetchRegistrations });
  const [target, setTarget] = useState<RegistrationTarget | null>(null);
  const blocked = (data?.staff.filter((s) => !s.standing.ok).length ?? 0) + (data?.partners.filter((p) => !p.standing.ok).length ?? 0);
  return (
    <div>
      <PageHeader title="Pharmacist registrations" onRefresh={() => refetch()} refreshing={isFetching}
        subtitle="Record each pharmacist's State Pharmacy Council registration and verify it on the council's register. Reminders go out 30 days before it lapses." />
      {blocked > 0 && <p className="mb-3 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg p-2" role="status">{blocked} pharmacist(s) are blocked until their registration is recorded or renewed.</p>}
      <QueryState isLoading={isLoading} error={error} isEmpty={false} emptyText="" />
      {data && (
        <>
          <h2 className="text-base font-semibold mb-2">Dawabag&apos;s pharmacists</h2>
          <RegTable rows={data.staff.map((s) => ({
            key: s.user_id, name: s.full_name ?? s.mobile, who: null, reg: s.registration_no ?? s.pharmacist_reg_no, council: s.state_council,
            till: s.valid_till, status: s.status, verifiedAt: s.verified_at, verifiedBy: s.verified_by_name, standing: s.standing,
            onEdit: () => setTarget({ kind: 'staff', id: s.user_id, name: s.full_name ?? s.mobile, registration_no: s.registration_no ?? s.pharmacist_reg_no,
              state_council: s.state_council, valid_till: s.valid_till, status: s.status, status_note: s.status_note, verified: !!s.verified_at }),
          }))} />
          <h2 className="text-base font-semibold mt-6 mb-2">Partners&apos; pharmacists</h2>
          <RegTable rows={data.partners.map((p) => ({
            key: p.id, name: p.full_name, who: p.partner_name, reg: p.registration_no, council: p.state_council, till: p.valid_till, status: p.status,
            verifiedAt: p.verified_at, verifiedBy: p.verified_by_name, standing: p.standing,
            onEdit: () => setTarget({ kind: 'partner', id: p.id, name: `${p.full_name} (${p.partner_name})`, registration_no: p.registration_no,
              state_council: p.state_council, valid_till: p.valid_till, status: p.status, status_note: p.status_note, verified: !!p.verified_at }),
          }))} />
        </>
      )}
      {target && <RegistrationDialog target={target} onClose={() => setTarget(null)} />}
    </div>
  );
}

interface Row {
  key: string; name: string; who: string | null; reg: string | null; council: string | null; till: string | null; status: string | null;
  verifiedAt: string | null; verifiedBy: string | null; standing: Parameters<typeof StandingBadge>[0]['standing']; onEdit: () => void;
}

function RegTable({ rows }: { rows: Row[] }) {
  if (!rows.length) return <p className="text-sm text-gray-500">None.</p>;
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
            <th className="px-3 py-2">Pharmacist</th><th className="px-3 py-2">Registration</th><th className="px-3 py-2">Valid till</th>
            <th className="px-3 py-2">Verified</th><th className="px-3 py-2">Standing</th><th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-gray-50 align-top" data-testid="registration-row">
              <td className="px-3 py-2"><p className="font-medium">{r.name}</p>{r.who && <p className="text-xs text-gray-500">{r.who}</p>}</td>
              <td className="px-3 py-2 text-xs"><p>{r.reg ?? '—'}</p><p className="text-gray-500">{r.council ?? 'Council not recorded'}</p></td>
              <td className="px-3 py-2 text-xs">{r.till ?? '—'}{r.status && r.status !== 'active' ? ` · ${r.status}` : ''}</td>
              <td className="px-3 py-2 text-xs">{r.verifiedAt ? `${formatDateTimeIST(r.verifiedAt)}${r.verifiedBy ? ` · ${r.verifiedBy}` : ''}` : 'No'}</td>
              <td className="px-3 py-2"><StandingBadge standing={r.standing} />{r.standing.message && <p className="text-xs text-gray-600 mt-1 max-w-xs">{r.standing.message}</p>}</td>
              <td className="px-3 py-2 text-right"><button type="button" onClick={r.onEdit} className="text-xs underline text-brand-700">Record / verify</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
