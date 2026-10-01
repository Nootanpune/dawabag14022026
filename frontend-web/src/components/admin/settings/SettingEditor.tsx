'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { settingsKeys, updateSetting, type AppSetting, type SettingMeta } from '@/lib/admin/settings';
import { fromDraft, toDraft, type Draft } from '@/lib/admin/settingsForm';
import { getApiErrorMessage } from '@/lib/apiErrors';
import Modal from '../Modal';
import DialogActions from '../DialogActions';

interface Props {
  setting: AppSetting;
  meta: SettingMeta;
  onClose: () => void;
}

function Field({ label, value, onChange, ...rest }: { label: string; value: string; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'>) {
  return (
    <label className="block text-sm">
      <span className="block font-medium text-gray-700 mb-1">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="input" {...rest} />
    </label>
  );
}

export default function SettingEditor({ setting, meta, onClose }: Props) {
  const { kind, label, unit, options, hint, nullable } = meta;
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => toDraft(kind, setting.value));
  const [error, setError] = useState('');
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });

  const save = useMutation({
    mutationFn: (value: unknown) => updateSetting(setting.key, value),
    onSuccess: () => {
      toast.success(`${label} updated`);
      onClose();
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not update setting')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: settingsKeys.all }),
  });

  const submit = () => {
    const out = fromDraft(kind, draft, nullable);
    if ('error' in out) return setError(out.error);
    setError('');
    save.mutate(out.value);
  };

  return (
    <Modal title={label} onClose={onClose}>
      <p className="text-xs text-gray-500 mb-3">
        <code>{setting.key}</code>
        {setting.description ? ` — ${setting.description}` : ''}
      </p>
      {kind === 'premises' ? (
        <div className="space-y-3">
          <Field label="Pincode" value={draft.pincode} onChange={(v) => set({ pincode: v })} maxLength={6} inputMode="numeric" />
          <Field label="Latitude" value={draft.latitude} onChange={(v) => set({ latitude: v })} inputMode="decimal" />
          <Field label="Longitude" value={draft.longitude} onChange={(v) => set({ longitude: v })} inputMode="decimal" />
        </div>
      ) : kind === 'choice' ? (
        <label className="block text-sm">
          <span className="block font-medium text-gray-700 mb-1">Value</span>
          <select value={draft.single} onChange={(e) => set({ single: e.target.value })} className="input" autoFocus>
            {!options?.some((o) => o.value === draft.single) && <option value="">Choose…</option>}
            {options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <Field
          label={kind === 'paise' ? 'Amount (₹)' : `Value${unit ? ` (${unit})` : ''}`}
          value={draft.single}
          onChange={(v) => set({ single: v })}
          inputMode={kind === 'text' ? 'text' : 'decimal'}
          maxLength={kind === 'text' ? 100 : undefined}
          autoFocus
        />
      )}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
      <DialogActions onCancel={onClose} onConfirm={submit} confirmLabel="Save" pending={save.isPending} error={error} />
    </Modal>
  );
}
