export const ADMIN_ROLES = ['admin', 'super_admin', 'pharmacist_rx'] as const;
/** roles allowed on credit / vendors / stock / jobs (server enforces the same) */
export const MANAGER_ROLES = ['admin', 'super_admin'] as const;

export function hasRole(role: string | undefined, roles: readonly string[]): boolean {
  return !!role && roles.includes(role);
}
