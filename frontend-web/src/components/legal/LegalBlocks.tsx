import type { ReactNode } from 'react';
import type { LegalInfo } from '@/lib/legal/api';
import { formatDateIST } from '@/lib/admin/format';

const orDash = (v: string | null | undefined) => (v && v.trim() ? v : '—');

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">{title}</h3>
      <div className="text-sm text-gray-600 space-y-0.5">{children}</div>
    </div>
  );
}

/** Seller identity and licences (C-04), pharmacist in charge (C-03), grievance officer (C-36). */
export default function LegalBlocks({ info }: { info: LegalInfo }) {
  const { entity, drug_licences: dl, pharmacist_in_charge: ph, grievance_officer: go, grievance_policy: gp } = info;
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      <Block title="Operated by">
        <p className="font-medium text-gray-800">{orDash(entity?.name)}</p>
        {entity?.address && <p>{entity.address}</p>}
        <p>GSTIN {orDash(entity?.gstin)}</p>
        <p>CIN {orDash(entity?.cin)}</p>
      </Block>
      <Block title="Drug licences">
        <p>Retail (Form 20) {orDash(dl?.retail_20)}</p>
        <p>Retail (Form 21) {orDash(dl?.retail_21)}</p>
        <p>Wholesale (Form 20B) {orDash(dl?.wholesale_20b)}</p>
        <p>Wholesale (Form 21B) {orDash(dl?.wholesale_21b)}</p>
        {dl?.valid_upto && <p>Valid up to {formatDateIST(dl.valid_upto)}</p>}
      </Block>
      <Block title="Pharmacist in charge">
        <p className="font-medium text-gray-800">{orDash(ph?.name)}</p>
        <p>Registration no. {orDash(ph?.registration_no)}</p>
      </Block>
      <Block title="Grievance officer">
        <p className="font-medium text-gray-800">{orDash(go?.name)}</p>
        {go?.email && (
          <p>
            <a href={`mailto:${go.email}`} className="text-brand-600 hover:underline">
              {go.email}
            </a>
          </p>
        )}
        {go?.phone && <p>{go.phone}</p>}
        {go?.address && <p>{go.address}</p>}
        <p className="text-xs text-gray-400 pt-1">
          We acknowledge complaints within {gp.acknowledge_within_hours} hours and resolve them within{' '}
          {gp.resolve_within_days} days.
        </p>
      </Block>
    </div>
  );
}
