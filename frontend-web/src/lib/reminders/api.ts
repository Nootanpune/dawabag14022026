// "My medicines" dose reminders (Sprint 33). The schedule and the Taken / Skipped
// answers live on the server only; this page reads and changes them there.
import api from '../api';

export interface DoseToday { time: string; scheduled_for: string; status: 'taken' | 'skipped' | null }
export interface Adherence { taken: number; skipped: number; missed: number; total: number }

export interface Reminder {
  id: string;
  product_id: string | null;
  product_name: string | null;
  medicine_name: string;
  dose: string | null;
  times: string[];
  start_date: string;
  end_date: string | null;
  source: 'order' | 'manual';
  order_id: string | null;
  is_active: boolean;
  today: DoseToday[];
  last_7_days: Adherence;
}

export interface ReminderSuggestion {
  product_id: string;
  medicine_name: string;
  order_id: string;
  order_number: string;
  ordered_at: string;
}

export interface ReminderInput {
  medicine_name: string;
  dose?: string | null;
  times: string[];
  start_date?: string;
  end_date?: string | null;
  product_id?: string | null;
  order_id?: string | null;
  is_active?: boolean;
}

export const reminderKeys = {
  all: ['reminders'] as const,
  suggestions: ['reminders', 'suggestions'] as const,
};

export async function fetchReminders(): Promise<Reminder[]> {
  const { data } = await api.get('/reminders');
  return data.data ?? [];
}

export async function fetchReminderSuggestions(): Promise<ReminderSuggestion[]> {
  const { data } = await api.get('/reminders/suggestions');
  return data.data ?? [];
}

export async function createReminder(input: ReminderInput): Promise<Reminder> {
  const { data } = await api.post('/reminders', input);
  return data.data;
}

export async function updateReminder(id: string, input: Partial<ReminderInput>): Promise<Reminder> {
  const { data } = await api.patch(`/reminders/${id}`, input);
  return data.data;
}

export async function deleteReminder(id: string) {
  const { data } = await api.delete(`/reminders/${id}`);
  return data.data;
}

export async function logDose(id: string, scheduledFor: string, status: 'taken' | 'skipped') {
  const { data } = await api.post(`/reminders/${id}/doses`, { scheduled_for: scheduledFor, status });
  return data.data;
}

/** "08:00" → "8:00 am" (times are Indian times) */
export function clockLabel(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** Common times offered as one-tap chips. */
export const QUICK_TIMES = ['08:00', '13:00', '20:00', '22:00'];
