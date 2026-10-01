'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { settingsKeys, updateSetting } from '@/lib/admin/settings';
import { fromLegalDraft, toLegalDraft, type LegalSettingDef } from '@/lib/admin/legalSettings';
import { legalKeys } from '@/lib/legal/api';
import { getApiErrorMessage, getApiFieldErrors } from '@/lib/apiErrors';
import Modal from '../Modal';
import DialogActions from '../DialogActions';

interface Props {
  def: LegalSettingDef;
  value: unknown;
  onClose: () => void;
}

export default function LegalSettingEditor({ def, value, onClose }: Props) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(() => toLegalDraft(def, value));
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: () => updateSetting(def.key, fromLegalDraft(def, draft)),
    onSuccess: () => {
      toast.success(`${def.title} updated`);
      onClose();
    },
    onError: (err) => {
      setFieldErrors(getApiFieldErrors(err));
      setError(getApiErrorMessage(err, 'Could not save'));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.all });
      queryClient.invalidateQueries({ queryKey: legalKeys.info });
    },
  });

  return (
    <Modal title={def.title} onClose={onClose} size="lg">
      <p className="text-xs text-gray-500 mb-3">
        Shown in the public site footer and on invoices. <code>{def.key}</code>
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {def.fields.map((f) => (
          <label key={f.name} className={f.type === 'textarea' ? 'block text-sm sm:col-span-2' : 'block text-sm'}>
            <span className="block font-medium text-gray-700 mb-1">{f.label}</span>
            {f.type === 'textarea' ? (
              <textarea
                value={draft[f.name]}
                onChange={(e) => setDraft({ ...draft, [f.name]: e.target.value })}
                maxLength={f.maxLength}
                rows={2}
                className="input"
              />
            ) : (
              <input
                type={f.type ?? 'text'}
                value={draft[f.name]}
                onChange={(e) => setDraft({ ...draft, [f.name]: e.target.value })}
                maxLength={f.maxLength}
                className="input"
              />
            )}
            {fieldErrors[f.name] && <span className="text-xs text-red-500">{fieldErrors[f.name]}</span>}
          </label>
        ))}
      </div>
      <DialogActions onCancel={onClose} onConfirm={() => save.mutate()} confirmLabel="Save" pending={save.isPending} error={error} />
    </Modal>
  );
}
