// Password rules shown on the website — a mirror of the server's
// utils/passwordPolicy.ts (the server decides; this only gives early feedback).
export const PASSWORD_MIN = 8;

export const PASSWORD_RULES = 'At least 8 characters, with a letter and a number. Not your mobile number.';

/** A plain reason the password is not acceptable, or '' when it is. */
export function passwordProblem(password: string, mobile?: string | null): string {
  if (password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters`;
  if (password.length > 72) return 'Password must be at most 72 characters';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Password must contain at least one letter and one number';
  if (/^\s|\s$/.test(password)) return 'Password cannot start or end with a space';
  if (mobile && password.includes(mobile)) return 'Password cannot contain the mobile number';
  return '';
}

// No look-alike characters (0/O, 1/l/I) so it can be read out over the phone
const LETTERS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';

/**
 * A temporary password for a new partner login, e.g. "Kmrt-7392-Hpwa". Made in the
 * browser's memory with the crypto random generator; shown once to the admin and
 * sent only to the server — never stored in the browser.
 */
export function generateTemporaryPassword(): string {
  const pick = (chars: string, n: number) => {
    const bytes = new Uint32Array(n);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => chars[b % chars.length]).join('');
  };
  return `${pick(LETTERS, 4)}-${pick(DIGITS, 4)}-${pick(LETTERS, 4)}`;
}
