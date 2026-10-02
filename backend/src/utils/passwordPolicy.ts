// Password rules for passwords set on someone's behalf (an admin's temporary
// password for a new partner login) and for the new password chosen in its place.
// Sign-up keeps its own minimum of 8 characters; these add a letter and a digit and
// refuse the mobile number itself (C-44: reasonable security practices).
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;   // bcrypt reads only the first 72 bytes

/** A plain reason the password is not acceptable, or null. */
export function passwordProblem(password: string, mobile?: string | null): string | null {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters`;
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX) return `Password must be at most ${PASSWORD_MAX} characters`;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Password must contain at least one letter and one number';
  if (/^\s|\s$/.test(password)) return 'Password cannot start or end with a space';
  if (mobile && password.includes(mobile)) return 'Password cannot contain the mobile number';
  return null;
}
