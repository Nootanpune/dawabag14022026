import type { SettingKind } from '@/lib/admin/settings';
import { formatPrice } from '@/lib/utils';

/** Read-only display of a setting value. */
export default function SettingValue({ kind, value, unit, options }: { kind?: SettingKind; value: unknown; unit?: string; options?: { value: string; label: string }[] }) {
  if (kind === 'choice') {
    const o = options?.find((x) => x.value === value);
    return <>{o ? o.label.split(' — ')[0] : String(value ?? '—')}</>;
  }
  if (kind === 'boolean') return <>{value === true ? 'On' : 'Off'}</>;
  if (kind === 'paise' && typeof value === 'number') return <>{formatPrice(value)}</>;
  if (kind === 'paise' && value === null) return <>Off</>;
  if (kind === 'premises' && value && typeof value === 'object') {
    const p = value as { pincode?: string; latitude?: number; longitude?: number };
    return (
      <>
        {p.pincode} · {p.latitude}, {p.longitude}
      </>
    );
  }
  // Sprint 43 (QA): plain words instead of raw JSON, e.g. {"paused":false} → "Paused: No"
  if (value !== null && typeof value === 'object') return <span className="text-xs font-normal">{plainWords(value)}</span>;
  return (
    <>
      {String(value ?? '—')}
      {unit && unit !== '₹' ? ` ${unit}` : ''}
    </>
  );
}

const label = (k: string) => k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** A setting held as a list or an object, in words. */
export function plainWords(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.map(plainWords).join(', ') : 'None';
  if (typeof value === 'object') {
    const parts = Object.entries(value as Record<string, unknown>).map(([k, v]) => `${label(k)}: ${plainWords(v)}`);
    return parts.length ? parts.join(' · ') : 'None';
  }
  return String(value);
}
