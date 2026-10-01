// India's date (IST), as the website shows it
export const todayIST = (d = new Date()) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);

/** India's date and clock time a few minutes from now, rounded up to 5 minutes (for consultation slots) */
export function istSoon(minutes: number) {
  const step = 5 * 60_000;
  const at = new Date(Math.ceil((Date.now() + 330 * 60_000 + minutes * 60_000) / step) * step);
  const hhmm = (d: Date) => d.toISOString().slice(11, 16);
  return { date: at.toISOString().slice(0, 10), time: hhmm(at), plus: (m: number) => hhmm(new Date(at.getTime() + m * 60_000)), weekday: at.getUTCDay() };
}
