// Courier tracking statuses and timestamps — pure helpers, no I/O

export function normaliseStatus(raw: string): string {
  const s = raw.toUpperCase();
  if (s.includes('RTO')) return 'rto';
  if (s.includes('OUT FOR DELIVERY')) return 'out_for_delivery';
  if (/^DELIVERED$/.test(s.trim())) return 'delivered';
  if (/UNDELIVERED|LOST|DAMAGE|CANCEL|DESTROYED|EXCEPTION/.test(s)) return 'exception';
  if (/PICKED UP|PICKUP DONE|SHIPPED/.test(s)) return 'picked_up';
  return 'in_transit';
}

// Shiprocket sends local Indian time without a zone ("2026-10-01 14:05:00" or
// "01 10 2026 14:05:00"); those are read as IST. Times with a zone are kept as sent.
export function courierTime(raw?: string): Date | null {
  if (!raw) return null;
  const t = raw.trim();
  let iso = t;
  const dmy = /^(\d{2})[ -/](\d{2})[ -/](\d{4})[ T](\d{2}:\d{2}(?::\d{2})?)$/.exec(t);
  if (dmy) iso = `${dmy[3]}-${dmy[2]}-${dmy[1]}T${dmy[4]}+05:30`;
  else if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(t)) iso = `${t.replace(' ', 'T')}+05:30`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
