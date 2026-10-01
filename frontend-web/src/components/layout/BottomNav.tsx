'use client';
import type { MouseEvent } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { House, Search, ClipboardList, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { isPortalPath, PORTAL_ROLES } from '@/lib/layout/portalPaths';
import { HOME_SEARCH_ID } from '@/components/home/HomeHero';

/** Phone-only tab bar for shoppers and guests (hidden from md up and in staff portals). */
export default function BottomNav() {
  const pathname = usePathname() ?? '';
  const { user, isAuthenticated } = useAuthStore();

  if (isPortalPath(pathname) || pathname.startsWith('/checkout')) return null;
  if (user?.role && PORTAL_ROLES.includes(user.role)) return null;

  const focusSearch = (e: MouseEvent) => {
    const input = document.getElementById(HOME_SEARCH_ID);
    if (pathname === '/' && input) {
      e.preventDefault();
      input.focus();
      input.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  };

  const items = [
    { href: '/', label: 'Home', icon: House, active: pathname === '/' },
    { href: '/?focus=search', label: 'Search', icon: Search, active: false, onClick: focusSearch },
    {
      href: isAuthenticated ? '/orders' : '/auth/login',
      label: 'Orders',
      icon: ClipboardList,
      active: pathname.startsWith('/orders'),
    },
    {
      href: isAuthenticated ? '/account' : '/auth/login',
      label: isAuthenticated ? 'Account' : 'Sign in',
      icon: UserRound,
      active: pathname.startsWith('/account') || pathname.startsWith('/auth'),
    },
  ];

  return (
    <>
      {/* Spacer so the last content (footer) is not hidden behind the fixed bar */}
      <div className="md:hidden h-[calc(4rem+env(safe-area-inset-bottom))]" aria-hidden="true" />
      <nav
        aria-label="Main"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="grid grid-cols-4 h-16">
          {items.map(({ href, label, icon: Icon, active, onClick }) => (
            <li key={label}>
              <Link
                href={href}
                onClick={onClick}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'h-full flex flex-col items-center justify-center gap-0.5 text-xs font-medium',
                  active ? 'text-brand-700' : 'text-gray-600 hover:text-brand-700'
                )}
              >
                <Icon className={cn('w-5 h-5', active && 'stroke-[2.5]')} aria-hidden="true" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
