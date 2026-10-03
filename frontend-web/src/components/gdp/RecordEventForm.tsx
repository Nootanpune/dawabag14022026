'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { COLD_MAX_C, COLD_MIN_C, EVENT_LABELS, MANUAL_KINDS, eventProblem, gdpKeys, readingIsExcursion, recordGdpEvent, type ManualKind } from '@/lib/gdp/api';

/** Record a reading, storage check, excursion, transfer or dispatch on one batch (Sprint 40, C-25). */
export default function RecordEventForm({ portal, batchId, coldChain }: { portal: boolean; batchId: string; coldChain: boolean }) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<ManualKind>('temperature_reading');
  const [temp, setTemp] = useState('');
  const [storage, setStorage] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const t = temp.trim() === '' ? null : Number(temp);
  const body = { event_kind: kind, temperature_c: t, storage_condition: storage.trim() || null, location: location.trim() || null, notes: notes.trim() || null };
  const problem = eventProblem(body) ?? (t !== null && Number.isNaN(t) ? 'Enter the temperature as a number.' : null);
  const save = useMutation({
    mutationFn: () => recordGdpEvent(portal, batchId, body),
    onSuccess: (r) => {
      toast[r.event_kind === 'excursion' ? 'warning' : 'success'](r.converted_to_excursion
        ? 'Reading outside 2–8 °C: recorded as an excursion — the batch is on hold until a pharmacist decides'
        : r.event_kind === 'excursion' ? 'Excursion recorded — the batch is on hold until a pharmacist decides' : 'Recorded');
      setTemp(''); setNotes(''); setLocation('');
      queryClient.invalidateQueries({ queryKey: gdpKeys.all });
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Could not record')),
  });
  return (
    <form className="card space-y-3 text-sm" onSubmit={(e) => { e.preventDefault(); if (!problem) save.mutate(); }} aria-labelledby="gdp-record">
      <h2 id="gdp-record" className="font-semibold">Record</h2>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block"><span className="block font-medium text-gray-700 mb-1">What</span>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as ManualKind)}>
            {MANUAL_KINDS.map((k) => <option key={k} value={k}>{EVENT_LABELS[k]}</option>)}
          </select>
        </label>
        <label className="block"><span className="block font-medium text-gray-700 mb-1">Temperature (°C){kind !== 'temperature_reading' ? ' — optional' : ''}</span>
          <input className="input" inputMode="decimal" value={temp} onChange={(e) => setTemp(e.target.value)} placeholder={coldChain ? `${COLD_MIN_C}–${COLD_MAX_C}` : 'e.g. 24'} />
        </label>
        <label className="block"><span className="block font-medium text-gray-700 mb-1">Storage condition (optional)</span>
          <input className="input" value={storage} onChange={(e) => setStorage(e.target.value)} placeholder={coldChain ? 'Fridge 1, 2–8 °C' : 'Shelf, below 30 °C'} />
        </label>
        <label className="block"><span className="block font-medium text-gray-700 mb-1">Location{kind === 'transfer' ? '' : ' (optional)'}</span>
          <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Cold room 1" />
        </label>
        <label className="block sm:col-span-2"><span className="block font-medium text-gray-700 mb-1">Notes{kind === 'excursion' ? ' — what happened, for how long' : ' (optional)'}</span>
          <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
      {kind === 'temperature_reading' && readingIsExcursion(coldChain, t) && (
        <p className="text-xs text-red-800 bg-red-50 border border-red-200 rounded p-2" role="status">
          {t} °C is outside {COLD_MIN_C}–{COLD_MAX_C} °C: it will be recorded as an excursion and the batch put on hold.
        </p>
      )}
      {problem && <p className="text-xs text-amber-800" role="status">{problem}</p>}
      <div className="flex justify-end">
        <button type="submit" className="btn-primary text-sm disabled:opacity-50" disabled={!!problem || save.isPending}>Save record</button>
      </div>
      <p className="text-xs text-gray-500">Records cannot be changed or deleted once saved (C-34).</p>
    </form>
  );
}
