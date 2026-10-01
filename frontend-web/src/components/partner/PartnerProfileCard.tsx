import type { PartnerMe } from '@/lib/partner/types';
import { DL_TYPE_LABELS } from '@/lib/admin/format';
import { formatPrice } from '@/lib/utils';
import StatusBadge from '@/components/admin/StatusBadge';
import { formatDateIST } from '@/lib/dates';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-gray-50 last:border-0">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right font-medium text-gray-800">{value ?? '—'}</dd>
    </div>
  );
}

export default function PartnerProfileCard({ me }: { me: PartnerMe }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold">{me.name}</h2>
        <StatusBadge status={me.approval_status} />
      </div>
      <dl className="text-sm">
        <Row label="GSTIN" value={me.gst_number} />
        <Row
          label="Drug licence"
          value={`${me.drug_license_no ?? '—'}${me.drug_license_type ? ` · ${DL_TYPE_LABELS[me.drug_license_type] ?? me.drug_license_type}` : ''}`}
        />
        <Row label="Licence expiry" value={formatDateIST(me.drug_license_expiry)} />
        <Row label="Invoice prefix" value={me.invoice_prefix} />
        <Row label="Location" value={[me.city, me.pincode].filter(Boolean).join(' ') || '—'} />
        <Row label="Rating" value={me.vendor_rating ?? '—'} />
        <Row label="Commission" value={me.commission_pct != null ? `${me.commission_pct}%` : 'Not set'} />
        <Row label="Finding fee" value={me.finding_fee_paise != null ? formatPrice(me.finding_fee_paise) : 'Not set'} />
      </dl>
    </div>
  );
}
