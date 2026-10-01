// Recall alert countdown (C-28: decide within 4 hours of receipt). IST input helpers live in lib/dates.ts.
// Nothing is stored: the countdown is computed from the server's due_at and the clock.

/** Time left to the deadline: "2h 05m left", or overdue. */
export function deadlineLeft(dueAt: string, now: number): { overdue: boolean; text: string } {
  const ms = new Date(dueAt).getTime() - now;
  if (ms <= 0) return { overdue: true, text: 'Overdue' };
  const mins = Math.floor(ms / 60000);
  return { overdue: false, text: `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m left` };
}
