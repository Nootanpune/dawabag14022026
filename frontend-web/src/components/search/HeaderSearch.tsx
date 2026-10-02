'use client';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { isPortalPath, PORTAL_ROLES } from '@/lib/layout/portalPaths';
import SearchCombobox from './SearchCombobox';

export const HEADER_SEARCH_ID = 'header-search';

/** Whether the header shows the medicine search on this page for this person. */
export function showsHeaderSearch(pathname: string, role: string | undefined): boolean {
  if (pathname === '/') return false;                           // the home page has its own large search
  if (pathname.startsWith('/checkout') || pathname.startsWith('/auth')) return false;
  if (isPortalPath(pathname)) return false;                     // staff, admin, partner, doctor portals
  return !(role && PORTAL_ROLES.includes(role));                // staff accounts do not shop
}

/** The header's search: a wide bar on large screens, a full-width row under the header on small ones. */
export default function HeaderSearch({ query }: { query?: string }) {
  const pathname = usePathname() ?? '';
  const role = useAuthStore((s) => s.user?.role);
  if (!showsHeaderSearch(pathname, role)) return null;
  return (
    <SearchCombobox
      id={HEADER_SEARCH_ID}
      label="Search medicines"
      initialQuery={query}
      className="order-last w-full pb-2 lg:order-none lg:w-auto lg:flex-1 lg:max-w-xl lg:pb-0 lg:mx-4"
    />
  );
}
