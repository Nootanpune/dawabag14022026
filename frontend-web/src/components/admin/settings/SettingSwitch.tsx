'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { settingsKeys, updateSetting, type AppSetting, type SettingMeta } from '@/lib/admin/settings';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { cn } from '@/lib/utils';
import Modal from '../Modal';
import DialogActions from '../DialogActions';

interface Props {
  setting: AppSetting;
  meta: SettingMeta;
  canEdit: boolean;
}

/** On/off setting; every change is confirmed first because it changes how the business runs (e.g. dispatch, C-31). */
export default function SettingSwitch({ setting, meta, canEdit }: Props) {
  const queryClient = useQueryClient();
  const on = setting.value === true;
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const save = useMutation({
    mutationFn: (value: boolean) => updateSetting(setting.key, value),
    onSuccess: (_r, value) => {
      toast.success(`${meta.label} switched ${value ? 'on' : 'off'}`);
      setConfirming(false);
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not update setting')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: settingsKeys.all }),
  });

  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={meta.label}
        disabled={!canEdit}
        onClick={() => {
          setError('');
          setConfirming(true);
        }}
        className={cn(
          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50',
          on ? 'bg-brand-600' : 'bg-gray-300'
        )}
      >
        <span className={cn('inline-block h-5 w-5 rounded-full bg-white shadow transition-transform', on ? 'translate-x-5' : 'translate-x-0.5')} />
      </button>
      {confirming && (
        <Modal title={`Switch ${meta.label} ${on ? 'off' : 'on'}?`} onClose={() => setConfirming(false)}>
          <p className="text-sm text-gray-600">{(on ? meta.confirm?.off : meta.confirm?.on) ?? 'This changes a business rule held on the server.'}</p>
          <DialogActions
            onCancel={() => setConfirming(false)}
            onConfirm={() => save.mutate(!on)}
            confirmLabel={on ? 'Switch off' : 'Switch on'}
            danger={on}
            pending={save.isPending}
            error={error}
          />
        </Modal>
      )}
    </>
  );
}
