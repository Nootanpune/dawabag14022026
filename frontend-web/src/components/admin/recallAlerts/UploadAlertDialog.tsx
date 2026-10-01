'use client';
import { useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { importAlert, type AlertHeaderBody } from '@/lib/recallAlerts/api';
import { ACCEPTED_COLUMNS, alertFileError, blankHeader, headerFromDraft } from '@/lib/recallAlerts/labels';
import type { AlertHeaderDraft } from '@/lib/recallAlerts/types';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';
import AlertHeaderFields from './AlertHeaderFields';
import { useCreateAlert } from './useCreateAlert';

/**
 * Upload a CDSCO NSQ / FDA / manufacturer list (.xlsx or .csv, ≤ 5 MB). The File lives
 * only in React state and goes straight to the server, which matches it against our
 * batches (C-28).
 */
export default function UploadAlertDialog({ onClose }: { onClose: () => void }) {
  const [header, setHeader] = useState<AlertHeaderDraft>(blankHeader);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const send = useCreateAlert((v: { file: File; header: AlertHeaderBody }) => importAlert(v.file, v.header), setError);

  const submit = () => {
    const h = headerFromDraft(header);
    const problem = h.problem || alertFileError(file);
    if (problem) return setError(problem);
    setError('');
    send.mutate({ file: file!, header: h.header! });
  };

  return (
    <Modal title="Upload an alert list" onClose={onClose} size="lg">
      <div className="space-y-4 text-sm">
        <AlertHeaderFields value={header} onChange={(p) => setHeader((h) => ({ ...h, ...p }))} />
        <div>
          <span className="block font-medium text-gray-700 mb-1">List file</span>
          <div className="flex flex-wrap items-center gap-3">
            <label className="btn-outline text-sm cursor-pointer inline-flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4" /> {file ? 'Change file' : 'Choose file'}
              <input
                type="file"
                accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setError('');
                  e.target.value = '';
                }}
              />
            </label>
            {file && (
              <span className="text-gray-700">
                {file.name} <span className="text-xs text-gray-400">({(file.size / 1024).toFixed(0)} KB)</span>
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            .xlsx or .csv up to 5 MB. The list needs a heading row with these columns: {ACCEPTED_COLUMNS.join(', ')}. Drug name and
            batch number are required on every line; rows above the headings are ignored.
          </p>
        </div>
      </div>
      <DialogActions onCancel={onClose} onConfirm={submit} confirmLabel="Upload and match" pending={send.isPending} error={error} />
    </Modal>
  );
}
