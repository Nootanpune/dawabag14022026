'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { settingsKeys, updateSetting } from '@/lib/admin/settings';
import { fromWaRows, toWaRows, WHATSAPP_TEMPLATES_KEY, type WaRow, type WaTemplates } from '@/lib/admin/whatsappTemplates';
import { getApiErrorList, getApiErrorMessage } from '@/lib/apiErrors';
import Modal from '../Modal';
import DialogActions from '../DialogActions';
import WhatsAppTemplateRowEditor from './WhatsAppTemplateRowEditor';

/** Table editor for whatsapp.templates; checked here as the server does, then re-validated there (422). */
export default function WhatsAppTemplatesEditor({ value, onClose }: { value: unknown; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<WaRow[]>(() => toWaRows(value));
  const [error, setError] = useState('');
  const [serverErrors, setServerErrors] = useState<string[]>([]);

  const save = useMutation({
    mutationFn: (v: WaTemplates) => updateSetting(WHATSAPP_TEMPLATES_KEY, v),
    onSuccess: () => {
      toast.success('WhatsApp templates updated');
      onClose();
    },
    onError: (err) => {
      setServerErrors(getApiErrorList(err));
      setError(getApiErrorMessage(err, 'Could not save the templates'));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: settingsKeys.all }),
  });

  const submit = () => {
    const out = fromWaRows(rows);
    setServerErrors([]);
    if ('error' in out) return setError(out.error);
    setError('');
    save.mutate(out.value);
  };

  return (
    <Modal title="WhatsApp templates" onClose={onClose} size="xl">
      <p className="text-xs text-gray-500 mb-3">
        Enter each template exactly as approved by Meta. The name uses lowercase letters, digits and _; variables fill the template body in
        order. Messages go only to buyers who turned on WhatsApp updates (C-42).
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
              <th className="font-medium py-2 pr-2">Message type</th>
              <th className="font-medium py-2 pr-2">Template name</th>
              <th className="font-medium py-2 pr-2">Language</th>
              <th className="font-medium py-2 pr-2">Body variables</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <WhatsAppTemplateRowEditor
                key={i}
                row={r}
                taken={new Set(rows.filter((_, j) => j !== i).map((x) => x.type))}
                onChange={(row) => setRows(rows.map((x, j) => (j === i ? row : x)))}
                onRemove={() => setRows(rows.filter((_, j) => j !== i))}
              />
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="text-center text-gray-400 text-sm py-4">No templates — nothing is sent on WhatsApp</p>}
      <button
        type="button"
        onClick={() => setRows([...rows, { type: '', name: '', language: 'en', vars: [] }])}
        className="btn-outline text-xs py-1.5 px-3 inline-flex items-center gap-1 mt-3"
      >
        <Plus className="w-3.5 h-3.5" /> Add message type
      </button>
      {serverErrors.length > 1 && (
        <ul className="text-xs text-red-500 mt-3 list-disc pl-4">
          {serverErrors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <DialogActions onCancel={onClose} onConfirm={submit} confirmLabel="Save templates" pending={save.isPending} error={error} />
    </Modal>
  );
}
