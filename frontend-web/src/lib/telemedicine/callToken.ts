// Call-token wording for the consultation room (Sprint 13, C-23). The channel
// name alone never lets anyone in: the server issues a token bound to this
// channel and this person, valid until an hour after the slot ends.
import type { JoinInfo } from './types';

/** Whole minutes the token stays valid, or null when the server sent none */
export function tokenMinutes(info: JoinInfo): number | null {
  if (!info.token || !info.token_expires_in) return null;
  return Math.max(1, Math.round(info.token_expires_in / 60));
}

/** The line shown under the call details */
export function tokenNotice(info: JoinInfo): { ok: boolean; text: string } {
  const minutes = tokenMinutes(info);
  if (minutes === null) {
    return { ok: false, text: 'The video service is not set up yet, so a secure call link could not be issued. Please contact support.' };
  }
  return { ok: true, text: `Secure call link valid for ${minutes} minute${minutes === 1 ? '' : 's'}.` };
}
