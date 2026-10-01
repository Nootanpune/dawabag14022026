'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { DLT_TEMPLATES_KEY, settingsKeys, updateSetting } from '@/lib/admin/settings';
import { fromDltRows, toDltRows, type DltRow, type DltTemplates } from '@/lib/admin/dltTemplates';
import { getApiErrorList, getApiErrorMessage } from '@/lib/apiErrors';
import Modal from '../Modal';
import DialogActions from '../DialogActions';
import DltTemplateRowEditor from './DltTemplateRowEditor';

/** Table editor for sms.dlt_templates; the server re-validates the whole object. */
export default function DltTemplatesEditor({ value, onClose }: { value: unknown; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<DltRow[]>(() => toDltRows(value));
  const [error, setError] = useState('');
  const [serverErrors, setServerErrors] = useState<string[]>([]);

  const save = useMutation({
    mutationFn: (v: DltTemplates) => updateSetting(DLT_TEMPLATES_KEY, v),
    onSuccess: () => {
      toast.success('SMS templates updated');
      onClose();
    },
    onError: (err) => {
      setServerErrors(getApiErrorList(err));
      setError(getApiErrorMessage(err, 'Could not save the templates'));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: settingsKeys.all }),
  });

  const submit = () => {
    const out = fromDltRows(rows);
    setServerErrors([]);
    if ('error' in out) return setError(out.error);
    setError('');
    save.mutate(out.value);
  };

  return (
    <Modal title="SMS templates (DLT)" onClose={onClose} size="xl">
      <p className="text-xs text-gray-500 mb-3">
        Indian operators deliver only DLT-registered templates, so a message type without a template here is not sent by SMS (it is logged as skipped).
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
              <th className="font-medium py-2 pr-2">Message type</th>
              <th className="font-medium py-2 pr-2">DLT template id</th>
              <th className="font-medium py-2 pr-2">Variables (MSG91 name = our value)</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <DltTemplateRowEditor
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
      {!rows.length && <p className="text-center text-gray-400 text-sm py-4">No templates — no SMS will be sent</p>}
      <button
        type="button"
        onClick={() => setRows([...rows, { type: '', template_id: '', vars: [] }])}
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
