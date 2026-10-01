'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  INCIDENT_CATEGORIES,
  INCIDENT_SEVERITIES,
  createIncident,
  incidentKeys,
  localInputToIso,
  nowLocalInput,
  type IncidentCategory,
  type IncidentSeverity,
} from '@/lib/compliance/incidents';
import { formatDateTimeIST } from '@/lib/admin/format';
import { getApiErrorMessage } from '@/lib/apiErrors';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';

/** Log a security incident; the 6-hour CERT-In clock runs from the detection time (C-43). */
export default function NewIncidentDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<IncidentCategory>('unauthorised_access');
  const [severity, setSeverity] = useState<IncidentSeverity>('high');
  const [description, setDescription] = useState('');
  const [personal, setPersonal] = useState(false);
  const [detected, setDetected] = useState(nowLocalInput);
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: createIncident,
    onSuccess: (r) => {
      toast.success(`${r.incident_no} logged — report to CERT-In by ${formatDateTimeIST(r.cert_in_due_at)}`);
      onClose();
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not log the incident')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: incidentKeys.all }),
  });

  const submit = () => {
    const detected_at = localInputToIso(detected);
    if (title.trim().length < 5) return setError('Give a title of at least 5 characters');
    if (description.trim().length < 10) return setError('Describe what happened (at least 10 characters)');
    if (!detected_at) return setError('Enter when it was detected');
    if (Date.parse(detected_at) > Date.now() + 60000) return setError('Detection time cannot be in the future');
    setError('');
    save.mutate({ title: title.trim(), category, severity, description: description.trim(), personal_data_affected: personal, detected_at });
  };

  return (
    <Modal title="Log security incident" onClose={onClose} size="lg">
      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <label className="block sm:col-span-2">
          <span className="block font-medium text-gray-700 mb-1">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className="input" autoFocus />
        </label>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value as IncidentCategory)} className="input">
            {INCIDENT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Severity</span>
          <select value={severity} onChange={(e) => setSeverity(e.target.value as IncidentSeverity)} className="input capitalize">
            {INCIDENT_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Detected at (your local time)</span>
          <input type="datetime-local" value={detected} max={nowLocalInput()} onChange={(e) => setDetected(e.target.value)} className="input" />
        </label>
        <label className="flex items-center gap-2 self-end pb-2">
          <input type="checkbox" checked={personal} onChange={(e) => setPersonal(e.target.checked)} />
          Personal data affected
        </label>
        <label className="block sm:col-span-2">
          <span className="block font-medium text-gray-700 mb-1">What happened</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="input" />
        </label>
      </div>
      <p className="text-xs text-gray-500 mt-3">
        CERT-In must receive the report within 6 hours of detection.
        {personal && ' A personal-data breach must also be notified to the Data Protection Board and the affected users.'}
      </p>
      <DialogActions onCancel={onClose} onConfirm={submit} confirmLabel="Log incident" pending={save.isPending} error={error} />
    </Modal>
  );
}
