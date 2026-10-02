'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Eye, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatDateIST } from '@/lib/dates';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { fetchPrescriptionLink, type MyPrescription } from '@/lib/prescriptions/api';
import { prescriptionStatus, type StatusTone } from '@/lib/prescriptions/status';

const TONES: Record<StatusTone, string> = {
  waiting: 'bg-amber-50 text-amber-800 border-amber-200',
  ok: 'bg-green-50 text-green-800 border-green-200',
  bad: 'bg-red-50 text-red-700 border-red-200',
  muted: 'bg-gray-100 text-gray-700 border-gray-200',
};

/** One of the buyer's prescriptions: when, status and a view link (signed, short-lived; C-41). */
export default function PrescriptionRow({ rx }: { rx: MyPrescription }) {
  const [opening, setOpening] = useState(false);
  const status = prescriptionStatus(rx);
  const digital = rx.is_digital || rx.file_type === 'eprescription';
  const title = digital ? `E-prescription${rx.doctor_name ? ` from Dr. ${rx.doctor_name}` : ''}`
    : rx.doctor_name ? `Prescription from Dr. ${rx.doctor_name}` : `Prescription (${(rx.file_type ?? 'file').toUpperCase()})`;

  const view = async () => {
    // Opened in a new tab straight from the object store; the link expires in minutes
    // (opened before the request so pop-up blockers allow it; detached from this page)
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    setOpening(true);
    try {
      const { url } = await fetchPrescriptionLink(rx.id);
      if (url && tab) tab.location.href = url;
      else if (url) window.location.href = url;
      else tab?.close();
    } catch (err) {
      tab?.close();
      toast.error(getApiErrorMessage(err, 'Could not open the prescription'));
    } finally {
      setOpening(false);
    }
  };

  return (
    <li className="card flex flex-col sm:flex-row sm:items-center gap-3" data-testid="prescription-row">
      <FileText className="w-8 h-8 text-brand-600 shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">{title}</p>
        <p className="text-xs text-gray-500">
          Uploaded {formatDateIST(rx.created_at)}
          {rx.patient_name ? ` · for ${rx.patient_name}` : ''}
          {rx.valid_until ? ` · valid until ${formatDateIST(rx.valid_until)}` : ''}
        </p>
        <p className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className={cn('text-xs font-medium border rounded-full px-2 py-0.5', TONES[status.tone])}>{status.label}</span>
          <span className="text-xs text-gray-600">{status.hint}</span>
        </p>
        {rx.order_id && (
          <Link href={`/orders/${rx.order_id}`} className="text-xs text-brand-700 hover:underline">
            View order{rx.order_number ? ` ${rx.order_number}` : ''}
          </Link>
        )}
      </div>
      {digital ? (
        <Link href="/account/consultations" className="btn-outline text-sm inline-flex items-center gap-1.5 self-start sm:self-auto">
          <Eye className="w-4 h-4" aria-hidden="true" /> View
        </Link>
      ) : (
        <button type="button" onClick={view} disabled={opening} aria-label={`View ${title}`}
          className="btn-outline text-sm inline-flex items-center gap-1.5 self-start sm:self-auto">
          {opening ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />} View
        </button>
      )}
    </li>
  );
}
