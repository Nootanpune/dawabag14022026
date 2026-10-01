'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { settingsKeys, updateSetting, type AppSetting } from '@/lib/admin/settings';
import {
  fromRetentionDraft,
  RETENTION_FIELDS,
  RETENTION_KEY,
  RETENTION_MAX_DAYS,
  toRetentionDraft,
  type RetentionField,
} from '@/lib/admin/retention';
import { formatDateTimeIST } from '@/lib/admin/format';
import { getApiErrorMessage } from '@/lib/apiErrors';
import Modal from '../Modal';
import DialogActions from '../DialogActions';

function RetentionEditor({ value, onClose }: { value: unknown; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(() => toRetentionDraft(value));
  const [error, setError] = useState('');
  const save = useMutation({
    mutationFn: (v: unknown) => updateSetting(RETENTION_KEY, v),
    onSuccess: () => {
      toast.success('Retention periods updated');
      onClose();
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not update retention periods')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: settingsKeys.all }),
  });
  const submit = () => {
    const out = fromRetentionDraft(draft);
    if ('error' in out) return setError(out.error);
    setError('');
    save.mutate(out.value);
  };
  return (
    <Modal title="Data retention periods" onClose={onClose}>
      <div className="space-y-3">
        {RETENTION_FIELDS.map((f) => (
          <label key={f.key} className="flex items-center justify-between gap-3 text-sm">
            <span>
              <span className="block font-medium text-gray-700">{f.label}</span>
              <span className="block text-xs text-gray-400">
                {f.min}–{RETENTION_MAX_DAYS} days
              </span>
            </span>
            <input
              type="number"
              min={f.min}
              max={RETENTION_MAX_DAYS}
              step={1}
              inputMode="numeric"
              value={draft[f.key]}
              onChange={(e) => setDraft({ ...draft, [f.key as RetentionField]: e.target.value })}
              className="input w-28 text-right"
            />
          </label>
        ))}
      </div>
      <DialogActions onCancel={onClose} onConfirm={submit} confirmLabel="Save" pending={save.isPending} error={error} />
    </Modal>
  );
}

/** retention.days (C-44): how long operational data is kept before the daily purge. */
export default function RetentionSection({ setting, canEdit }: { setting: AppSetting | undefined; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const draft = toRetentionDraft(setting?.value);
  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-end justify-between gap-2 mb-2">
        <div>
          <h2 className="text-base font-semibold">Data retention</h2>
          <p className="text-xs text-gray-500">
            Operational data is deleted after these periods by the daily retention_purge job; statutory records (invoices,
            prescriptions, registers, consents, audit log) are never purged.
          </p>
        </div>
        {canEdit && setting && (
          <button onClick={() => setEditing(true)} className="btn-outline text-xs py-1.5 px-3">
            Edit
          </button>
        )}
      </div>
      <div className="card p-0 divide-y divide-gray-100">
        {!setting ? (
          <p className="text-sm text-gray-400 px-4 py-3">Missing on server — nothing is purged</p>
        ) : (
          RETENTION_FIELDS.map((f) => (
            <div key={f.key} className="px-4 py-2.5 flex justify-between gap-3 text-sm">
              <span>{f.label}</span>
              <span className="font-semibold">{draft[f.key] ? `${draft[f.key]} days` : <span className="text-gray-400">kept</span>}</span>
            </div>
          ))
        )}
      </div>
      {setting && <p className="text-xs text-gray-400 mt-1">Updated {formatDateTimeIST(setting.updated_at)}</p>}
      {editing && <RetentionEditor value={setting?.value} onClose={() => setEditing(false)} />}
    </section>
  );
}
