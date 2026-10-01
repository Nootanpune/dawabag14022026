// Staff, admin, partner and doctor portals have their own shell: no public footer
// and no customer bottom navigation there.
const PORTAL_PREFIXES = ['/admin', '/staff', '/partner', '/doctor'];

export function isPortalPath(pathname: string | null | undefined): boolean {
  const p = pathname ?? '';
  return PORTAL_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

/** Roles that work in a portal rather than shop (they get no customer bottom nav). */
export const PORTAL_ROLES = ['admin', 'super_admin', 'pharmacist_rx', 'pharmacist_pack', 'delivery', 'partner', 'doctor'];

/** Staff who may see internal notes such as "awaiting pharmacist review" (C-19). */
export const STAFF_ROLES = ['admin', 'super_admin', 'pharmacist_rx', 'pharmacist_pack'];
