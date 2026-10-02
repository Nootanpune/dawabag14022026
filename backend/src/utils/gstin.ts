// GSTIN checks (CGST Rules, rule 10 / Form GST REG-06 layout), used when Dawabag's
// admin enters a partner's GST registration (C-33: a partner sells only when
// GST-registered). A GSTIN is 15 characters:
//   2 digits  state code (27 = Maharashtra)
//   10 chars  the holder's PAN (5 letters, 4 digits, 1 letter)
//   1 char    entity number for that PAN in the state (1–9, then A–Z)
//   'Z'       fixed
//   1 char    check character (mod-36 checksum of the first 14)
import { stateCode } from './gstStateCodes';

const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
/** First two digits that are real state / union-territory codes (97 = other territory, 99 = centre). */
const VALID_STATE = (code: number) => (code >= 1 && code <= 38) || code === 97 || code === 99;

/** The check character for the first 14 characters (the standard GSTIN mod-36 scheme). */
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = CHARS.indexOf(first14[i]);
    if (value < 0) throw new Error('GSTIN may contain only digits and capital letters');
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

export type GstinResult = { ok: true; gstin: string; stateCode: string; pan: string } | { ok: false; reason: string };

/** Format, state code and check character, with a plain reason when wrong. */
export function checkGstin(raw: string | null | undefined): GstinResult {
  const gstin = (raw ?? '').replace(/\s+/g, '').toUpperCase();
  if (gstin.length !== 15) return { ok: false, reason: 'A GSTIN has exactly 15 characters' };
  if (!SHAPE.test(gstin)) {
    return { ok: false, reason: 'This is not a GSTIN: it should look like 27ABCDE1234F1Z5 (state code, PAN, entity number, Z, check character)' };
  }
  if (!VALID_STATE(Number(gstin.slice(0, 2)))) return { ok: false, reason: `GSTIN starts with ${gstin.slice(0, 2)}, which is not a state code` };
  if (gstinCheckChar(gstin.slice(0, 14)) !== gstin[14]) {
    return { ok: false, reason: 'The GSTIN\'s last character does not match — please check it for a typing mistake' };
  }
  return { ok: true, gstin, stateCode: gstin.slice(0, 2), pan: gstin.slice(2, 12) };
}

/**
 * The GSTIN's state code must be the state of the address it is registered at
 * (one registration per state). Returns a plain reason, or null when they agree.
 */
export function gstinStateProblem(gstin: string, state: string): string | null {
  const expected = stateCode(state);
  if (!expected) return `"${state}" is not a state we recognise — write the full state name, e.g. Maharashtra`;
  if (gstin.slice(0, 2) !== expected) {
    return `The GSTIN starts with ${gstin.slice(0, 2)} but ${state} is state code ${expected}: a GSTIN belongs to the state of the business address`;
  }
  return null;
}
