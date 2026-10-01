// India-time helpers for recall alerts (C-28: decide within 4 hours of receipt).
// Nothing is stored: the countdown is computed from the server's due_at and the clock.

const IST_OFFSET_MIN = 330;

/** Now in India time as a datetime-local value (YYYY-MM-DDTHH:mm). */
export function istNowInput(): string {
  return new Date(Date.now() + IST_OFFSET_MIN * 60000).toISOString().slice(0, 16);
}

/** datetime-local value read as India time → ISO string with +05:30 offset. */
export function istInputToIso(v: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return undefined;
  const iso = `${v}:00+05:30`;
  return Number.isNaN(new Date(iso).getTime()) ? undefined : iso;
}

/** Time left to the deadline: "2h 05m left", or overdue. */
export function deadlineLeft(dueAt: string, now: number): { overdue: boolean; text: string } {
  const ms = new Date(dueAt).getTime() - now;
  if (ms <= 0) return { overdue: true, text: 'Overdue' };
  const mins = Math.floor(ms / 60000);
  return { overdue: false, text: `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m left` };
}
