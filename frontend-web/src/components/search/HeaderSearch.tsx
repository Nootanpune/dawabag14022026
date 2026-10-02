'use client';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { isPortalPath, PORTAL_ROLES } from '@/lib/layout/portalPaths';
import { useInView } from '@/hooks/useInView';
import SearchCombobox from './SearchCombobox';

export const HEADER_SEARCH_ID = 'header-search';
/** The home page's large search box (components/home/HomeHero). */
export const HOME_SEARCH_ID = 'home-search';

/** Whether the header shows the medicine search on this page for this person. */
export function showsHeaderSearch(pathname: string, role: string | undefined): boolean {
  if (pathname.startsWith('/checkout') || pathname.startsWith('/auth')) return false;
  if (isPortalPath(pathname)) return false;                     // staff, admin, partner, doctor portals
  return !(role && PORTAL_ROLES.includes(role));                // staff accounts do not shop
}

/** The header's search: a wide bar on large screens, a full-width row under the header on small ones.
 *  On home it appears once the large search box has scrolled away (one search box on screen at a time). */
export default function HeaderSearch({ query }: { query?: string }) {
  const pathname = usePathname() ?? '';
  const role = useAuthStore((s) => s.user?.role);
  const home = pathname === '/';
  const homeBoxVisible = useInView(HOME_SEARCH_ID, home);
  if (!showsHeaderSearch(pathname, role) || (home && homeBoxVisible)) return null;
  return (
    <SearchCombobox
      id={HEADER_SEARCH_ID}
      label="Search medicines"
      initialQuery={query}
      className="order-last w-full pb-2 lg:order-none lg:w-auto lg:flex-1 lg:max-w-xl lg:pb-0 lg:mx-4"
    />
  );
}
