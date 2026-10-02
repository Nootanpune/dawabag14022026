'use client';
import { useState } from 'react';
import type { PartnerDetail, PartnerLicence } from '@/lib/admin/partnerOnboarding';
import { partnerKeys } from '@/lib/admin/partnerOnboarding';
import LicenceList from '@/components/licences/LicenceList';
import LicenceDocumentButton from '@/components/licences/LicenceDocumentButton';
import LicenceDecisionDialog from '@/components/licences/LicenceDecisionDialog';
import StatusBadge from '../StatusBadge';

/**
 * Who the partner may sell to, from its checked licences in date: retail (Forms 20/21) →
 * patients; wholesale (Forms 20B/21B) → licensed trade buyers. Every licence is listed with
 * its valid-till date; renewals the partner sent from its portal wait here for the check.
 */
export default function PartnerSummaryCard({ p }: { p: PartnerDetail }) {
  const [checking, setChecking] = useState<PartnerLicence | null>(null);
  const rights = [p.selling_rights.retail && 'patients (retail licence)', p.selling_rights.wholesale && 'licensed trade buyers (wholesale licence)']
    .filter(Boolean).join(' and ');
  const waiting = p.waiting_licences ?? [];
  return (
    <section className="card text-sm" aria-label="Summary">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={p.is_active ? p.approval_status : 'suspended'} />
        <span className="font-mono text-xs">{p.gstin ?? 'No GSTIN'}</span>
        <span className="text-gray-500">invoice prefix {p.invoice_prefix ?? '—'}</span>
      </div>
      <p className="mt-2"><span className="text-gray-500">May sell to:</span> {rights || 'nobody — no licence in date'}</p>
      <h3 className="mt-3 font-medium text-gray-900">Drug licences ({p.licences.length})</h3>
      <LicenceList licences={p.licences} label="Partner drug licences"
        actions={(l) => (l.id && l.has_document ? <LicenceDocumentButton licenceId={l.id} where="admin" /> : null)} />
      {waiting.length > 0 && (
        <>
          <h3 className="mt-3 font-medium text-amber-900">Sent by the partner — to check</h3>
          <LicenceList licences={waiting} label="Licences waiting for the check"
            actions={(l) => (l.id ? (
              <>
                {l.has_document && <LicenceDocumentButton licenceId={l.id} where="admin" />}
                {l.status === 'pending' && (
                  <button type="button" className="btn-primary text-xs py-1 px-2" onClick={() => setChecking(l)}>Check</button>
                )}
              </>
            ) : null)} />
        </>
      )}
      {checking && (
        <LicenceDecisionDialog licence={checking} partyName={p.legal_name} onClose={() => setChecking(null)}
          refresh={[partnerKeys.detail(p.id), partnerKeys.list]} />
      )}
    </section>
  );
}
