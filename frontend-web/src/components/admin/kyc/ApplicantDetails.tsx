import type { KycApplicant } from '@/lib/admin/kyc';
import { CUSTOMER_TYPE_SHORT, DL_TYPE_LABELS, formatDateIST, formatDateTimeIST } from '@/lib/admin/format';
import StatusBadge from '../StatusBadge';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-gray-50 last:border-0">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-gray-900 text-right break-all">{value ?? '—'}</dd>
    </div>
  );
}

export default function ApplicantDetails({ user }: { user: KycApplicant }) {
  const isDoctor = user.customer_type === 'doc_hospital';
  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="font-semibold">{user.business_name || user.full_name}</h2>
          <p className="text-xs text-gray-500">{CUSTOMER_TYPE_SHORT[user.customer_type] ?? user.customer_type}</p>
        </div>
        <StatusBadge status={user.kyc_status} />
      </div>
      <dl className="text-sm">
        <Row label="Contact" value={user.full_name} />
        <Row label="Mobile" value={user.mobile} />
        <Row label="Email" value={user.email || '—'} />
        <Row label="Pincode" value={user.registration_pincode || '—'} />
        <Row label="PAN" value={user.pan_number || '—'} />
        {!isDoctor && (
          <Row
            label="GSTIN"
            value={user.gstin || (user.gst_unregistered_declaration ? 'Not registered (declared)' : '—')}
          />
        )}
        {!isDoctor && (
          <>
            <Row
              label="Drug licence"
              value={
                user.drug_license_number
                  ? `${user.drug_license_number}${user.drug_license_type ? ` · ${DL_TYPE_LABELS[user.drug_license_type] ?? user.drug_license_type}` : ''}`
                  : '—'
              }
            />
            <Row label="Licence valid to" value={formatDateIST(user.drug_license_expiry)} />
          </>
        )}
        {isDoctor && (
          <>
            <Row label="Registration no." value={user.nmc_reg_number || '—'} />
            <Row label="Council" value={user.nmc_council_state || '—'} />
            <Row label="Speciality" value={user.doctor_speciality || '—'} />
          </>
        )}
        <Row label="Registered" value={formatDateTimeIST(user.created_at)} />
        <Row label="Submitted" value={formatDateTimeIST(user.kyc_submitted_at)} />
        {user.kyc_approved_at && <Row label="Approved" value={formatDateTimeIST(user.kyc_approved_at)} />}
        {user.kyc_rejection_reason && <Row label="Rejection reason" value={user.kyc_rejection_reason} />}
      </dl>
    </div>
  );
}
