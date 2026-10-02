'use client';
import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { QUICK_TIMES, clockLabel, type ReminderInput } from '@/lib/reminders/api';
import { todayIST } from '@/lib/dates';

interface Props {
  initial?: Partial<ReminderInput>;
  pending: boolean;
  error: string;
  submitLabel: string;
  onSubmit: (v: ReminderInput) => void;
  onCancel: () => void;
}

/** Medicine, dose, up to 6 times a day (India time), start and optional end date. */
export default function ReminderForm({ initial, pending, error, submitLabel, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initial?.medicine_name ?? '');
  const [dose, setDose] = useState(initial?.dose ?? '');
  const [times, setTimes] = useState<string[]>(initial?.times ?? ['08:00']);
  const [newTime, setNewTime] = useState('');
  const [start, setStart] = useState(initial?.start_date ?? todayIST());
  const [end, setEnd] = useState(initial?.end_date ?? '');
  const addTime = (t: string) => { if (t && !times.includes(t) && times.length < 6) setTimes([...times, t].sort()); };

  return (
    <form className="card space-y-3 text-sm" aria-label="Reminder"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ medicine_name: name.trim(), dose: dose.trim() || null, times, start_date: start, end_date: end || null,
          product_id: initial?.product_id ?? null, order_id: initial?.order_id ?? null });
      }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="rem-name" className="block text-xs font-semibold mb-1">Medicine</label>
          <input id="rem-name" className="input" required minLength={2} maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="rem-dose" className="block text-xs font-semibold mb-1">Dose (optional)</label>
          <input id="rem-dose" className="input" maxLength={80} placeholder="e.g. 1 tablet" value={dose} onChange={(e) => setDose(e.target.value)} />
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold mb-1">Times (India time)</p>
        <div className="flex flex-wrap gap-2 items-center">
          {times.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-brand-50 text-brand-800 px-2.5 py-1 text-xs font-medium">
              {clockLabel(t)}
              <button type="button" aria-label={`Remove ${clockLabel(t)}`} onClick={() => setTimes(times.filter((x) => x !== t))}><X className="w-3 h-3" /></button>
            </span>
          ))}
          {QUICK_TIMES.filter((t) => !times.includes(t)).map((t) => (
            <button key={t} type="button" onClick={() => addTime(t)} className="rounded-full border border-gray-300 px-2.5 py-1 text-xs text-gray-700">
              + {clockLabel(t)}
            </button>
          ))}
          <span className="inline-flex items-center gap-1">
            <label htmlFor="rem-time" className="sr-only">Another time</label>
            <input id="rem-time" type="time" className="input py-1 w-28" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
            <button type="button" aria-label="Add this time" onClick={() => { addTime(newTime); setNewTime(''); }} className="p-1.5 rounded border border-gray-300">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </span>
        </div>
      </div>
      <div className="grid gap-3 grid-cols-2">
        <div>
          <label htmlFor="rem-start" className="block text-xs font-semibold mb-1">From</label>
          <input id="rem-start" type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div>
          <label htmlFor="rem-end" className="block text-xs font-semibold mb-1">Until (optional)</label>
          <input id="rem-end" type="date" className="input" value={end ?? ''} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-outline text-sm">Cancel</button>
        <button type="submit" disabled={pending || !times.length || name.trim().length < 2} className="btn-primary text-sm">{submitLabel}</button>
      </div>
    </form>
  );
}
