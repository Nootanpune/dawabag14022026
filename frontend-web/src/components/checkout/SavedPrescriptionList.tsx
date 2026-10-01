'use client';
import { FileCheck2 } from 'lucide-react';
import type { MyPrescription } from '@/lib/prescriptions/api';
import { formatDate } from '@/lib/utils';

interface Props {
  prescriptions: MyPrescription[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** Verified, unexpired prescriptions the buyer can offer for this order (C-08). */
export default function SavedPrescriptionList({ prescriptions, selectedId, onSelect }: Props) {
  return (
    <div className="mt-4">
      <p className="text-sm font-medium text-gray-700 mb-2">Or use a saved prescription our pharmacist has verified</p>
      {prescriptions.map((rx) => (
        <button
          key={rx.id}
          type="button"
          onClick={() => onSelect(rx.id)}
          className={`w-full text-left p-3 rounded-xl border-2 transition-colors mb-2 flex items-start gap-3
            ${selectedId === rx.id ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-300'}`}
        >
          <FileCheck2 className="w-5 h-5 text-brand-600 mt-0.5 shrink-0" />
          <span>
            <span className="block text-sm font-medium text-brand-700">
              {rx.doctor_name ? `Dr. ${rx.doctor_name}` : 'Verified prescription'}
              {rx.patient_name ? ` · for ${rx.patient_name}` : ''}
            </span>
            <span className="block text-xs text-gray-500">
              Uploaded {formatDate(rx.created_at)} · valid until {rx.valid_until ? formatDate(rx.valid_until) : '—'}
            </span>
          </span>
        </button>
      ))}
      <p className="text-xs text-gray-500">
        It must cover every prescription medicine and quantity in this order. Our pharmacist checks it again before dispatch.
      </p>
    </div>
  );
}
