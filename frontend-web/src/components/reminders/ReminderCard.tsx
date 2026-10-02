'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Pause, Pencil, Play, SkipForward, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { clockLabel, deleteReminder, logDose, reminderKeys, updateReminder, type Reminder, type ReminderInput } from '@/lib/reminders/api';
import ReminderForm from './ReminderForm';

/** One medicine's reminder: today's doses with Taken / Skipped, last 7 days, pause, edit, delete. */
export default function ReminderCard({ r }: { r: Reminder }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const refresh = () => queryClient.invalidateQueries({ queryKey: reminderKeys.all });
  const fail = (e: unknown) => toast.error(getApiErrorMessage(e, 'Could not save'));

  const dose = useMutation({ mutationFn: (v: { at: string; status: 'taken' | 'skipped' }) => logDose(r.id, v.at, v.status), onSuccess: refresh, onError: fail });
  const update = useMutation({
    mutationFn: (v: Partial<ReminderInput>) => updateReminder(r.id, v),
    onSuccess: () => { setEditing(false); setError(''); refresh(); },
    onError: (e) => setError(getApiErrorMessage(e, 'Could not save')),
  });
  const remove = useMutation({ mutationFn: () => deleteReminder(r.id), onSuccess: () => { toast.success('Reminder deleted'); refresh(); }, onError: fail });
  const now = Date.now();

  if (editing) {
    return <ReminderForm initial={r} pending={update.isPending} error={error} submitLabel="Save" onCancel={() => setEditing(false)}
      onSubmit={(v) => update.mutate({ medicine_name: v.medicine_name, dose: v.dose, times: v.times, start_date: v.start_date, end_date: v.end_date })} />;
  }
  return (
    <li className="card text-sm space-y-2" aria-label={r.medicine_name} data-testid="reminder-card">
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 break-words">{r.medicine_name}</p>
          <p className="text-xs text-gray-500">
            {[r.dose, r.times.map(clockLabel).join(', '), r.end_date ? `until ${r.end_date}` : null, r.source === 'order' ? 'from your order' : null]
              .filter(Boolean).join(' · ')}
          </p>
        </div>
        {!r.is_active && <span className="text-xs font-medium text-gray-600 bg-gray-100 rounded px-2 py-0.5">Paused</span>}
      </div>
      {r.is_active && r.today.length > 0 && (
        <ul className="space-y-1.5" aria-label="Today’s doses">
          {r.today.map((d) => {
            const due = Date.parse(d.scheduled_for) <= now + 12 * 3_600_000;
            return (
              <li key={d.scheduled_for} className="flex flex-wrap items-center gap-2">
                <span className="w-20 font-medium">{clockLabel(d.time)}</span>
                {d.status && <span className={`text-xs font-semibold ${d.status === 'taken' ? 'text-green-700' : 'text-amber-700'}`}>{d.status === 'taken' ? 'Taken' : 'Skipped'}</span>}
                {due && (
                  <span className="flex gap-1.5 ml-auto">
                    <button type="button" disabled={dose.isPending} onClick={() => dose.mutate({ at: d.scheduled_for, status: 'taken' })}
                      aria-label={`Taken at ${clockLabel(d.time)}`} className="inline-flex items-center gap-1 rounded-md border border-green-600 px-2 py-0.5 text-xs text-green-800">
                      <Check className="w-3 h-3" /> Taken
                    </button>
                    <button type="button" disabled={dose.isPending} onClick={() => dose.mutate({ at: d.scheduled_for, status: 'skipped' })}
                      aria-label={`Skipped at ${clockLabel(d.time)}`} className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-0.5 text-xs text-gray-700">
                      <SkipForward className="w-3 h-3" /> Skipped
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {r.last_7_days.total > 0 && (
        <p className="text-xs text-gray-600">Last 7 days: {r.last_7_days.taken} taken, {r.last_7_days.skipped} skipped, {r.last_7_days.missed} not answered</p>
      )}
      <div className="flex flex-wrap gap-3 pt-1 text-xs">
        <button type="button" onClick={() => update.mutate({ is_active: !r.is_active })} className="inline-flex items-center gap-1 text-brand-700">
          {r.is_active ? <><Pause className="w-3.5 h-3.5" /> Pause</> : <><Play className="w-3.5 h-3.5" /> Resume</>}
        </button>
        <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-brand-700"><Pencil className="w-3.5 h-3.5" /> Edit</button>
        <button type="button" onClick={() => { if (window.confirm(`Delete the reminder for ${r.medicine_name}?`)) remove.mutate(); }}
          className="inline-flex items-center gap-1 text-red-700"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
      </div>
    </li>
  );
}
