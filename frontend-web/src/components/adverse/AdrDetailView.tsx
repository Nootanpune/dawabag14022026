import type { ReactNode } from 'react';
import { labelOf, OUTCOMES, SERIOUSNESS, type AdrDetail } from '@/lib/compliance/adverseEvents';
import StatusBadge from '@/components/admin/StatusBadge';
import { formatDateIST, formatDateTimeIST } from '@/lib/dates';

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <p className="flex gap-3">
      <span className="w-32 shrink-0 text-gray-500">{label}</span>
      <span>{value ?? '—'}</span>
    </p>
  );
}

/** A side-effect report (C-29), for the reporter and the pharmacist. */
export default function AdrDetailView({ r }: { r: AdrDetail }) {
  return (
    <div className="card text-sm space-y-1.5">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <h1 className="text-lg font-semibold font-mono">{r.report_no}</h1>
        <StatusBadge status={r.status} />
        {r.overdue && <StatusBadge status="overdue" />}
      </div>
      <Row label="Medicine" value={r.product_name} />
      <Row label="Order" value={r.order_number} />
      <Row label="Batch" value={r.batch_number} />
      <Row
        label="Patient"
        value={[r.patient_initials, r.patient_age_years != null ? `${r.patient_age_years} y` : null, r.patient_gender]
          .filter(Boolean)
          .join(' · ')}
      />
      <Row label="Seriousness" value={labelOf(SERIOUSNESS, r.seriousness)} />
      <Row label="Outcome" value={labelOf(OUTCOMES, r.outcome)} />
      <Row label="Started on" value={r.onset_date ? formatDateIST(r.onset_date) : null} />
      <Row label="Reported" value={formatDateTimeIST(r.created_at)} />
      <div className="pt-2">
        <p className="text-xs font-semibold text-gray-500">Reaction</p>
        <p className="whitespace-pre-wrap">{r.reaction}</p>
      </div>
      {(r.pharmacist_notes || r.pvpi_reference) && (
        <div className="rounded-lg bg-gray-50 p-3 mt-2">
          {r.pharmacist_notes && <p className="whitespace-pre-wrap">{r.pharmacist_notes}</p>}
          {r.pvpi_reference && <p className="text-xs text-gray-500 mt-1">PvPI reference {r.pvpi_reference}</p>}
        </div>
      )}
    </div>
  );
}
