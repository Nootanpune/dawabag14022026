// Drug schedule display helpers. Values come from products.drug_schedule:
// 'OTC' | 'Schedule G' | 'Schedule H' | 'Schedule H1' | 'Schedule X' | 'NDPS'.
// The server enforces every schedule rule; these only decide what to show.

/** true for any scheduled drug (anything except OTC / blank) */
export function isScheduledDrug(schedule: string | null | undefined): boolean {
  const s = (schedule ?? '').trim().toUpperCase();
  return s !== '' && s !== 'OTC';
}

/** true for Schedule H1 (C-09 register / partner declaration) — accepts 'Schedule H1' or 'H1' */
export function isScheduleH1(schedule: string | null | undefined): boolean {
  const s = (schedule ?? '').trim().toUpperCase();
  return s === 'SCHEDULE H1' || s === 'H1';
}

/** true when a patient buyer needs a prescription (Schedule H / H1, C-08) */
export function isRxSchedule(schedule: string | null | undefined): boolean {
  const s = (schedule ?? '').trim().toUpperCase();
  return s === 'SCHEDULE H' || s === 'H' || isScheduleH1(schedule);
}

/** Short badge text ("Sch H1", "NDPS"), or null for OTC — no "Sch OTC" badge. */
export function scheduleBadge(schedule: string | null | undefined): string | null {
  if (!isScheduledDrug(schedule)) return null;
  const s = (schedule ?? '').trim();
  return /^schedule\s+/i.test(s) ? `Sch ${s.replace(/^schedule\s+/i, '')}` : s;
}
