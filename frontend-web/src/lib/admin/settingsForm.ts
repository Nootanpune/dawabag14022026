// Converts server setting values to/from the strings typed in the settings editor.
import { rupeesToPaise } from './format';
import type { Premises, SettingKind } from './settings';

export type Draft = { single: string; pincode: string; latitude: string; longitude: string };

export function toDraft(kind: SettingKind, value: unknown): Draft {
  const d: Draft = { single: '', pincode: '', latitude: '', longitude: '' };
  if (kind === 'premises') {
    const p = (value ?? {}) as Partial<Premises>;
    return { ...d, pincode: p.pincode ?? '', latitude: String(p.latitude ?? ''), longitude: String(p.longitude ?? '') };
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return d;
  return { ...d, single: kind === 'paise' ? (n / 100).toString() : String(n) };
}

/** Returns the value to PUT, or an error string. Ranges are enforced by the server. */
export function fromDraft(kind: SettingKind, d: Draft): { value: unknown } | { error: string } {
  if (kind === 'premises') {
    const latitude = Number(d.latitude);
    const longitude = Number(d.longitude);
    if (!/^\d{6}$/.test(d.pincode.trim())) return { error: 'Pincode must be 6 digits' };
    if (d.latitude.trim() === '' || !Number.isFinite(latitude)) return { error: 'Enter a valid latitude' };
    if (d.longitude.trim() === '' || !Number.isFinite(longitude)) return { error: 'Enter a valid longitude' };
    return { value: { pincode: d.pincode.trim(), latitude, longitude } };
  }
  if (d.single.trim() === '') return { error: 'Enter a value' };
  if (kind === 'paise') {
    const paise = rupeesToPaise(d.single);
    return paise == null ? { error: 'Enter an amount in rupees' } : { value: paise };
  }
  const n = Number(d.single);
  if (!Number.isFinite(n)) return { error: 'Enter a number' };
  if (kind === 'int' && !Number.isInteger(n)) return { error: 'Enter a whole number' };
  return { value: n };
}
