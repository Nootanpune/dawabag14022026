'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  INCIDENT_STATUSES,
  fetchIncident,
  incidentKeys,
  updateIncident,
  type Incident,
  type IncidentStatus,
  type IncidentUpdate,
} from '@/lib/compliance/incidents';
import { getApiErrorMessage } from '@/lib/apiErrors';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';
import CertInBadge from './CertInBadge';
import { istInputToIso, nowISTInput } from '@/lib/dates';

function When({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block font-medium text-gray-700 mb-1">{label} (IST)</span>
      <input type="datetime-local" value={value} max={nowISTInput()} onChange={(e) => onChange(e.target.value)} className="input" />
    </label>
  );
}

/** Record CERT-In / DPB / user notifications, actions and status (C-43). Only new values are sent. */
export default function UpdateIncidentDialog({ incident, onClose }: { incident: Incident; onClose: () => void }) {
  const queryClient = useQueryClient();
  // Latest copy from the server (GET /compliance/incidents/:id); the list row is the placeholder.
  const { data } = useQuery({ queryKey: incidentKeys.one(incident.id), queryFn: () => fetchIncident(incident.id), placeholderData: incident });
  const i = data ?? incident;
  const [status, setStatus] = useState<IncidentStatus>(incident.status);
  const [certAt, setCertAt] = useState('');
  const [certRef, setCertRef] = useState('');
  const [dpbAt, setDpbAt] = useState('');
  const [usersAt, setUsersAt] = useState('');
  const [actions, setActions] = useState(incident.actions_taken ?? '');
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: (body: IncidentUpdate) => updateIncident(i.id, body),
    onSuccess: () => {
      toast.success(`${i.incident_no} updated`);
      onClose();
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not update the incident')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: incidentKeys.all }),
  });

  const submit = () => {
    const body: IncidentUpdate = {};
    if (status !== i.status) body.status = status;
    if (certAt || certRef.trim()) {
      if (!certAt || certRef.trim().length < 3) return setError('Enter both the CERT-In report time and its acknowledgement reference');
      body.cert_in_reported_at = istInputToIso(certAt);
      body.cert_in_reference = certRef.trim();
    }
    if (dpbAt) body.dpb_notified_at = istInputToIso(dpbAt);
    if (usersAt) body.users_notified_at = istInputToIso(usersAt);
    if (actions.trim() && actions.trim() !== (i.actions_taken ?? '')) {
      if (actions.trim().length < 10) return setError('Describe the actions in at least 10 characters');
      body.actions_taken = actions.trim();
    }
    if (status === 'closed') {
      if (!body.actions_taken && !i.actions_taken) return setError('Describe the actions taken before closing');
      if (i.personal_data_affected && (!(body.dpb_notified_at || i.dpb_notified_at) || !(body.users_notified_at || i.users_notified_at))) {
        return setError('A personal-data breach is closed only after the Data Protection Board and users are notified');
      }
    }
    if (!Object.keys(body).length) return setError('Nothing to save');
    setError('');
    save.mutate(body);
  };

  return (
    <Modal title={`${i.incident_no} — record progress`} onClose={onClose} size="lg">
      <CertInBadge incident={i} large />
      <div className="grid sm:grid-cols-2 gap-3 text-sm mt-4">
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as IncidentStatus)} className="input capitalize">
            {INCIDENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <div />
        {!i.cert_in_reported_at && (
          <>
            <When label="Reported to CERT-In at" value={certAt} onChange={setCertAt} />
            <label className="block">
              <span className="block font-medium text-gray-700 mb-1">CERT-In acknowledgement reference</span>
              <input value={certRef} onChange={(e) => setCertRef(e.target.value)} maxLength={100} className="input" />
            </label>
          </>
        )}
        {i.personal_data_affected && !i.dpb_notified_at && <When label="Data Protection Board notified at" value={dpbAt} onChange={setDpbAt} />}
        {i.personal_data_affected && !i.users_notified_at && <When label="Affected users notified at" value={usersAt} onChange={setUsersAt} />}
        <label className="block sm:col-span-2">
          <span className="block font-medium text-gray-700 mb-1">Actions taken {status === 'closed' ? '(required to close)' : ''}</span>
          <textarea value={actions} onChange={(e) => setActions(e.target.value)} rows={4} className="input" />
        </label>
      </div>
      <DialogActions onCancel={onClose} onConfirm={submit} confirmLabel="Save" pending={save.isPending} error={error} />
    </Modal>
  );
}
