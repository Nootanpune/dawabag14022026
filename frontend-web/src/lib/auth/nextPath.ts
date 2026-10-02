// Where to go after signing in (?next=/prescriptions). Only a path on this site is
// accepted — never another origin ("//evil.example", "https://…") — so the login
// page cannot be used to send people elsewhere.
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null;
  if (raw.startsWith('/auth/')) return null;
  return raw.slice(0, 300);
}

export function loginHref(next: string | null | undefined): string {
  const safe = safeNextPath(next);
  return safe ? `/auth/login?next=${encodeURIComponent(safe)}` : '/auth/login';
}
