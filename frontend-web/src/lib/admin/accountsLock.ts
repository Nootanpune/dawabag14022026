// GST period lock (Sprint 13; C-30, C-31, C-34). Once the CA has filed the returns
// for a period, accounts sets accounts.locked_until; purchase entries (GRN) and
// supplier credit notes dated on or before it are refused by the server (409).

import { daysAgoIST } from '../dates';

export const ACCOUNTS_LOCK_KEY = 'accounts.locked_until';

/** The server accepts only a date before today in India (IST), or null to open the period */
export function latestLockableDate(): string {
  return daysAgoIST(1);
}

export function lockedUntil(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/** Mirrors SETTING_SCHEMAS['accounts.locked_until']; '' when fine. */
export function lockDateError(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Choose a date';
  if (date > latestLockableDate()) return 'Only a past date can be locked';
  return '';
}

/** A server refusal because a document falls in the locked period (assertOpenPeriod) */
export function isLockedPeriodError(message: string): boolean {
  return /closed GST period/i.test(message);
}
