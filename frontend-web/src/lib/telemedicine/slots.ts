// Builds the slot list a doctor submits from a date range, a daily window and a
// slot length. Pure: the server stores them and skips any it already has.
import type { NewSlot } from './types';

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Dates from `from` to `to` inclusive (YYYY-MM-DD), at most `max` days. */
export function datesBetween(from: string, to: string, max = 31): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end && out.length < max) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export interface SlotPlan {
  from: string;
  to: string;
  start: string; // HH:MM
  end: string; // HH:MM
  minutes: number;
  /** 0 = Sunday … 6 = Saturday */
  weekdays: number[];
}

export function buildSlots(p: SlotPlan): NewSlot[] {
  const startMin = toMin(p.start);
  const endMin = toMin(p.end);
  if (!(p.minutes > 0) || endMin <= startMin) return [];
  const slots: NewSlot[] = [];
  for (const date of datesBetween(p.from, p.to)) {
    if (!p.weekdays.includes(new Date(`${date}T00:00:00Z`).getUTCDay())) continue;
    for (let t = startMin; t + p.minutes <= endMin; t += p.minutes) {
      slots.push({ slot_date: date, slot_start: toHHMM(t), slot_end: toHHMM(t + p.minutes) });
    }
  }
  return slots;
}

/** `date` (YYYY-MM-DD) moved by `days`. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Groups rows by slot day, keeping the server's order. */
export function groupByDay<T extends { slot_date: string }>(rows: T[]): [string, T[]][] {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const day = r.slot_date.slice(0, 10);
    out.set(day, [...(out.get(day) ?? []), r]);
  }
  return Array.from(out.entries());
}
