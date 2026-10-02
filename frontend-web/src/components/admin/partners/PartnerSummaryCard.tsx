import type { PartnerDetail } from '@/lib/admin/partnerOnboarding';
import { licenceLabel } from '@/lib/admin/partnerOnboarding';
import { formatDateIST } from '@/lib/dates';
import StatusBadge from '../StatusBadge';

const STATUS_TEXT = { valid: 'valid', expiring: 'renew soon', expired: 'expired' } as const;

/**
 * Who the partner may sell to, from its licences in date: retail (Forms 20/21) →
 * patients; wholesale (Forms 20B/21B) → licensed trade buyers.
 */
export default function PartnerSummaryCard({ p }: { p: PartnerDetail }) {
  const rights = [p.selling_rights.retail && 'patients (retail licence)', p.selling_rights.wholesale && 'licensed trade buyers (wholesale licence)']
    .filter(Boolean).join(' and ');
  return (
    <section className="card text-sm" aria-label="Summary">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={p.is_active ? p.approval_status : 'suspended'} />
        <span className="font-mono text-xs">{p.gstin ?? 'No GSTIN'}</span>
        <span className="text-gray-500">invoice prefix {p.invoice_prefix ?? '—'}</span>
      </div>
      <p className="mt-2"><span className="text-gray-500">May sell to:</span> {rights || 'nobody — no licence in date'}</p>
      <ul className="mt-2 grid sm:grid-cols-2 gap-1">
        {p.licences.map((l) => (
          <li key={l.licence_type} className={l.status === 'valid' ? '' : 'text-amber-800'}>
            {licenceLabel(l.licence_type)} <span className="font-mono">{l.licence_number}</span> — till {formatDateIST(l.valid_upto)} ({STATUS_TEXT[l.status]})
          </li>
        ))}
      </ul>
    </section>
  );
}
