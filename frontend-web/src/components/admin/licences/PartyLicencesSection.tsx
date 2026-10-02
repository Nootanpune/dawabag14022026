'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { fetchPartyLicences, licenceKeys, type AdminLicenceRow } from '@/lib/licences/api';
import { formatDateIST } from '@/lib/dates';
import { Pill } from '@/components/licences/LicenceList';
import LicenceDocumentButton from '@/components/licences/LicenceDocumentButton';
import LicenceDecisionDialog from '@/components/licences/LicenceDecisionDialog';
import QueryState from '../QueryState';

const FILTERS = [
  { value: 'waiting', label: 'To check' },
  { value: 'expiring', label: 'Ending in 30 days' },
  { value: 'expired', label: 'Expired' },
  { value: 'all', label: 'All' },
] as const;
type Filter = (typeof FILTERS)[number]['value'];

const KIND: Record<string, string> = {
  supplier: 'Supplier', marketplace_partner: 'Partner', both: 'Partner + supplier',
  b2b_retailer: 'Retailer', b2b_wholesaler: 'Wholesaler', doc_hospital: 'Doctor / hospital',
};
const VALIDITY_TONE: Record<string, string> = {
  valid: 'bg-green-100 text-green-800', expiring: 'bg-orange-100 text-orange-800', expired: 'bg-red-100 text-red-800', no_date: 'bg-gray-100 text-gray-700',
};

function partyHref(r: AdminLicenceRow) {
  if (r.user_id) return `/admin/kyc/${r.user_id}`;
  if (r.party_kind === 'supplier') return '/admin/suppliers';
  return `/admin/partners/${r.vendor_id}`;
}

/**
 * Drug licences of partners, suppliers and buyer accounts (Sprint 30): what waits for a
 * check, what ends within 30 days, what has expired (that party is blocked until renewed).
 * Dawabag's own licences are the register above (C-07).
 */
export default function PartyLicencesSection() {
  const [filter, setFilter] = useState<Filter>('waiting');
  const [checking, setChecking] = useState<AdminLicenceRow | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: licenceKeys.admin(filter), queryFn: () => fetchPartyLicences(filter) });
  return (
    <section className="mt-8" aria-labelledby="party-licences-title">
      <h2 id="party-licences-title" className="text-base font-semibold">Partner, supplier and buyer licences</h2>
      <p className="text-xs text-gray-500 mb-3">Every drug licence of the businesses Dawabag sells through, buys from and sells to.</p>
      <div className="flex flex-wrap gap-2 mb-3" role="tablist">
        {FILTERS.map((f) => (
          <button key={f.value} role="tab" aria-selected={filter === f.value} onClick={() => setFilter(f.value)}
            className={filter === f.value ? 'btn-primary text-xs py-1.5 px-3' : 'btn-outline text-xs py-1.5 px-3'}>{f.label}</button>
        ))}
      </div>
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="Nothing here" />
      {!!data?.length && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                <th className="font-medium px-4 py-2.5">Business</th>
                <th className="font-medium px-4 py-2.5">Licence</th>
                <th className="font-medium px-4 py-2.5">Valid till</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 align-top" data-testid="party-licence-row">
                  <td className="px-4 py-2.5">
                    <Link href={partyHref(r)} className="font-medium text-brand-700 hover:underline">{r.party_name ?? '—'}</Link>
                    <p className="text-xs text-gray-500">{KIND[r.party_kind ?? ''] ?? r.party_kind}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <p>{r.label} <span className="font-mono">{r.licence_number}</span></p>
                    {r.status === 'pending' && <Pill text="waiting for the check" tone="bg-amber-100 text-amber-800" />}
                    {r.status === 'rejected' && <Pill text="not accepted" tone="bg-red-100 text-red-800" />}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    <p>{r.valid_upto ? formatDateIST(r.valid_upto) : '—'}</p>
                    <Pill text={r.validity === 'expiring' ? 'renew soon' : r.validity.replace('_', ' ')} tone={VALIDITY_TONE[r.validity]} />
                  </td>
                  <td className="px-4 py-2.5 text-right space-x-1 whitespace-nowrap">
                    {r.has_document && r.id && <LicenceDocumentButton licenceId={r.id} where="admin" />}
                    {r.status === 'pending' && (
                      <button type="button" className="btn-primary text-xs py-1 px-2" onClick={() => setChecking(r)}>Check</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {checking && (
        <LicenceDecisionDialog licence={checking} partyName={checking.party_name} onClose={() => setChecking(null)}
          refresh={[['admin', 'party-licences']]} />
      )}
    </section>
  );
}
