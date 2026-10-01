'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { doctorKeys, issuePrescription } from '@/lib/telemedicine/doctorApi';
import { allowedListsText } from '@/lib/telemedicine/labels';
import { buildPrescriptionBody, emptyRow, MAX_ITEMS, type MedicineRowValues } from '@/lib/telemedicine/prescriptionForm';
import type { ConsultationDetail } from '@/lib/telemedicine/types';
import { getApiErrorLines } from '@/lib/apiErrors';
import ErrorLines from '../common/ErrorLines';
import MedicineRow from './MedicineRow';

/**
 * E-prescription for one consultation (TPG 2020; C-23, C-24). The server refuses
 * any medicine the guidelines do not allow for this consultation and lists each
 * one; the prescription is final once issued.
 */
export default function PrescribeForm({ c }: { c: Pick<ConsultationDetail, 'id' | 'mode' | 'consult_kind'> }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [diagnosis, setDiagnosis] = useState('');
  const [advice, setAdvice] = useState('');
  const [newCondition, setNewCondition] = useState(false);
  const [rows, setRows] = useState<MedicineRowValues[]>(() => [emptyRow()]);
  const [errors, setErrors] = useState<string[]>([]);
  const kind = newCondition ? 'first' : c.consult_kind;

  const issue = useMutation({
    mutationFn: (body: Parameters<typeof issuePrescription>[1]) => issuePrescription(c.id, body),
    onSuccess: (r) => {
      toast.success(`E-prescription issued · code ${r.verification_code}`);
      queryClient.invalidateQueries({ queryKey: doctorKeys.all });
      router.push(`/doctor/prescriptions/${r.id}`);
    },
    onError: (err) => setErrors(getApiErrorLines(err, 'Could not issue the prescription')),
  });

  const submit = () => {
    const { body, problems } = buildPrescriptionBody(diagnosis, advice, newCondition, rows);
    setErrors(problems);
    if (body) issue.mutate(body);
  };

  return (
    <div className="card space-y-4 text-sm">
      <p className="text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded-lg p-3">
        {allowedListsText(kind, c.mode)} Schedule X and NDPS medicines are never allowed; medicines not yet classified by the pharmacist
        are refused.
      </p>
      <label className="block font-medium text-gray-700">
        Diagnosis
        <textarea value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} rows={2} maxLength={1000} className="input mt-1" />
      </label>
      {c.consult_kind === 'follow_up' && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={newCondition} onChange={(e) => setNewCondition(e.target.checked)} className="mt-0.5" />
          <span>
            This is a new condition
            <span className="block text-xs text-gray-500">Treated as a first consultation: fewer medicines are allowed.</span>
          </span>
        </label>
      )}
      <div className="space-y-2">
        {rows.map((r, i) => (
          <MedicineRow
            key={r.key}
            n={i + 1}
            row={r}
            onChange={(next) => setRows(rows.map((x) => (x.key === r.key ? next : x)))}
            onRemove={() => setRows(rows.filter((x) => x.key !== r.key))}
          />
        ))}
        {rows.length < MAX_ITEMS && (
          <button type="button" onClick={() => setRows([...rows, emptyRow()])} className="btn-outline text-xs inline-flex items-center gap-1">
            <Plus className="w-3 h-3" /> Add medicine
          </button>
        )}
      </div>
      <label className="block font-medium text-gray-700">
        Advice (optional)
        <textarea value={advice} onChange={(e) => setAdvice(e.target.value)} rows={3} maxLength={2000} className="input mt-1" />
      </label>
      <ErrorLines lines={errors} title={errors.length > 1 ? 'The prescription was not issued' : undefined} />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-gray-500">Once issued it cannot be changed. The patient may use it at any pharmacy.</p>
        <button onClick={submit} disabled={issue.isPending} className="btn-primary inline-flex items-center gap-2">
          {issue.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Issue e-prescription
        </button>
      </div>
    </div>
  );
}
