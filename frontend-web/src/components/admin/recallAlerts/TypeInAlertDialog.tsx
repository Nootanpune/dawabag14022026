'use client';
import { useState } from 'react';
import { createAlert } from '@/lib/recallAlerts/api';
import { blankAlertLine, blankHeader, headerFromDraft, linesFromDrafts } from '@/lib/recallAlerts/labels';
import type { AlertHeaderDraft, AlertLineDraft } from '@/lib/recallAlerts/types';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';
import AlertHeaderFields from './AlertHeaderFields';
import AlertLineRows from './AlertLineRows';
import { useCreateAlert } from './useCreateAlert';

/** Type in an alert received by email or letter; the server matches it against our batches (C-28). */
export default function TypeInAlertDialog({ onClose }: { onClose: () => void }) {
  const [header, setHeader] = useState<AlertHeaderDraft>(blankHeader);
  const [rows, setRows] = useState<AlertLineDraft[]>(() => [blankAlertLine()]);
  const [error, setError] = useState('');
  const send = useCreateAlert(createAlert, setError);

  const submit = () => {
    const h = headerFromDraft(header);
    if (h.problem) return setError(h.problem);
    const l = linesFromDrafts(rows);
    if (l.problem) return setError(l.problem);
    setError('');
    send.mutate({ ...h.header!, lines: l.lines });
  };

  return (
    <Modal title="Type in an alert" onClose={onClose} size="xl">
      <div className="space-y-4 text-sm">
        <AlertHeaderFields value={header} onChange={(p) => setHeader((h) => ({ ...h, ...p }))} />
        <div>
          <h3 className="font-medium text-gray-700 mb-2">Lines on the alert</h3>
          <AlertLineRows rows={rows} onChange={setRows} />
        </div>
      </div>
      <DialogActions onCancel={onClose} onConfirm={submit} confirmLabel="Enter and match" pending={send.isPending} error={error} />
    </Modal>
  );
}
