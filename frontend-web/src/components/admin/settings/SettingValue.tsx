import type { SettingKind } from '@/lib/admin/settings';
import { formatPrice } from '@/lib/utils';

/** Read-only display of a setting value. */
export default function SettingValue({ kind, value, unit }: { kind?: SettingKind; value: unknown; unit?: string }) {
  if (kind === 'paise' && typeof value === 'number') return <>{formatPrice(value)}</>;
  if (kind === 'premises' && value && typeof value === 'object') {
    const p = value as { pincode?: string; latitude?: number; longitude?: number };
    return (
      <>
        {p.pincode} · {p.latitude}, {p.longitude}
      </>
    );
  }
  if (value !== null && typeof value === 'object') return <code className="text-xs">{JSON.stringify(value)}</code>;
  return (
    <>
      {String(value ?? '—')}
      {unit && unit !== '₹' ? ` ${unit}` : ''}
    </>
  );
}
