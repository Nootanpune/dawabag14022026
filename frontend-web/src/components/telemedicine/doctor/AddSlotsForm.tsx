'use client';
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { addSlots, doctorKeys } from '@/lib/telemedicine/doctorApi';
import { teleKeys } from '@/lib/telemedicine/api';
import { buildSlots, type SlotPlan } from '@/lib/telemedicine/slots';
import { getApiErrorLines } from '@/lib/apiErrors';
import { cn } from '@/lib/utils';
import ErrorLines from '../common/ErrorLines';
import { todayIST } from '@/lib/dates';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_PER_REQUEST = 200; // server limit per POST

/** Slots for a date range: one daily window cut into equal slots. Existing slots are skipped by the server. */
export default function AddSlotsForm() {
  const queryClient = useQueryClient();
  const today = todayIST();
  const [plan, setPlan] = useState<SlotPlan>({ from: today, to: today, start: '10:00', end: '13:00', minutes: 15, weekdays: [1, 2, 3, 4, 5, 6] });
  const [errors, setErrors] = useState<string[]>([]);
  const slots = useMemo(() => buildSlots(plan), [plan]);

  const add = useMutation({
    mutationFn: () => addSlots(slots),
    onSuccess: (r) => {
      setErrors([]);
      toast.success(`${r.added} slot${r.added === 1 ? '' : 's'} added${r.skipped ? `, ${r.skipped} already existed` : ''}`);
    },
    onError: (err) => setErrors(getApiErrorLines(err, 'Could not add the slots')),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: teleKeys.all });
      queryClient.invalidateQueries({ queryKey: doctorKeys.all });
    },
  });

  const submit = () => {
    if (!slots.length) return setErrors(['No slots: check the dates, the days of the week and that the end time is after the start']);
    if (slots.length > MAX_PER_REQUEST) return setErrors([`At most ${MAX_PER_REQUEST} slots at a time — shorten the date range`]);
    add.mutate();
  };

  const set = (patch: Partial<SlotPlan>) => setPlan({ ...plan, ...patch });
  const toggleDay = (d: number) =>
    set({ weekdays: plan.weekdays.includes(d) ? plan.weekdays.filter((x) => x !== d) : [...plan.weekdays, d] });

  return (
    <div className="card text-sm space-y-4">
      <h2 className="font-semibold">Add slots</h2>
      <div className="grid sm:grid-cols-5 gap-3">
        <label className="block font-medium text-gray-700">
          From
          <input type="date" min={today} value={plan.from} onChange={(e) => set({ from: e.target.value })} className="input mt-1" />
        </label>
        <label className="block font-medium text-gray-700">
          To
          <input type="date" min={plan.from} value={plan.to} onChange={(e) => set({ to: e.target.value })} className="input mt-1" />
        </label>
        <label className="block font-medium text-gray-700">
          Start (IST)
          <input type="time" value={plan.start} onChange={(e) => set({ start: e.target.value })} className="input mt-1" />
        </label>
        <label className="block font-medium text-gray-700">
          End (IST)
          <input type="time" value={plan.end} onChange={(e) => set({ end: e.target.value })} className="input mt-1" />
        </label>
        <label className="block font-medium text-gray-700">
          Minutes each
          <select value={plan.minutes} onChange={(e) => set({ minutes: Number(e.target.value) })} className="input mt-1">
            {[10, 15, 20, 30, 45, 60].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-1">
        {DAYS.map((d, i) => (
          <button
            key={d}
            type="button"
            onClick={() => toggleDay(i)}
            className={cn(
              'px-2.5 py-1 rounded-lg border text-xs',
              plan.weekdays.includes(i) ? 'bg-brand-600 border-brand-600 text-white' : 'border-gray-200 text-gray-600'
            )}
          >
            {d}
          </button>
        ))}
      </div>
      <ErrorLines lines={errors} />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-gray-500">{slots.length} slot{slots.length === 1 ? '' : 's'} will be offered (India time).</p>
        <button onClick={submit} disabled={add.isPending} className="btn-primary inline-flex items-center gap-2">
          {add.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Add slots
        </button>
      </div>
    </div>
  );
}
