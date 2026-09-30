export const ADMIN_ROLES = ['admin', 'super_admin', 'pharmacist_rx'] as const;
/** roles allowed on credit / vendors / stock / jobs (server enforces the same) */
export const MANAGER_ROLES = ['admin', 'super_admin'] as const;

export function hasRole(role: string | undefined, roles: readonly string[]): boolean {
  return !!role && roles.includes(role);
}

/** return decisions (approve / reject) — mirrors routes/return.routes.ts */
export const RETURN_DECIDE_ROLES = ['admin', 'super_admin', 'pharmacist_rx'] as const;
/** may see the returns queue and record disposition */
export const RETURN_STAFF_ROLES = ['admin', 'super_admin', 'pharmacist_rx', 'pharmacist_pack'] as const;
/** pharmacist copy review (C-19) and side-effect reports (C-29) */
export const PHARMACIST_ROLES = ['pharmacist_rx', 'admin', 'super_admin'] as const;
