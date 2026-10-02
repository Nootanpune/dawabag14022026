'use client';
import Link from 'next/link';
import { ShoppingCart, User, LogOut, ClipboardList, Home, Stethoscope, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useCart } from '@/hooks/useCart';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { staffHome } from '@/lib/fulfilment/roles';
import HeaderSearch from '@/components/search/HeaderSearch';

interface Props {
  /** the query of the search results page, shown in the header's search box */
  searchQuery?: string;
}

export default function Header({ searchQuery }: Props = {}) {
  const { user, isAuthenticated, logout } = useAuthStore();
  const { data: cart } = useCart();
  const queryClient = useQueryClient();
  const router = useRouter();
  const cartCount = isAuthenticated ? cart?.item_count ?? 0 : 0;
  const pathname = usePathname() ?? '';
  const navLink = (href: string) => {
    const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
    return {
      'aria-current': active ? ('page' as const) : undefined,
      className: cn('flex items-center gap-1 hover:text-brand-700', active && 'text-brand-700'),
    };
  };

  const handleLogout = async () => {
    await logout();
    queryClient.clear(); // drop the signed-in user's cached server data
    router.push('/auth/login');
  };

  return (
    <header className="bg-white/95 backdrop-blur border-b border-gray-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 min-h-16 flex flex-wrap items-center justify-between gap-x-3">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 h-16">
          <div className="w-9 h-9 bg-brand-600 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold">D</span>
          </div>
          <span className="leading-tight">
            <span className="block text-xl font-bold text-brand-700 tracking-tight">dawabag</span>
            {/* Licence details are in the footer and on /legal (C-04) */}
            <span className="hidden sm:flex items-center gap-1 text-[11px] font-medium text-gray-600">
              <ShieldCheck className="w-3 h-3 text-brand-600" aria-hidden="true" /> Licensed online pharmacy
            </span>
          </span>
        </Link>

        {/* Medicine search on every shopping page (Sprint 25) */}
        <HeaderSearch query={searchQuery} />

        {/* Nav */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600">
          <Link href="/" {...navLink('/')}>
            <Home className="w-4 h-4" /> Home
          </Link>
          <Link href="/consult" {...navLink('/consult')}>
            <Stethoscope className="w-4 h-4" /> Consult a doctor
          </Link>
          {/* Riders have no orders of their own and cannot open buyers' orders (Sprint 13, C-41) */}
          {isAuthenticated && user?.role !== 'delivery' && (
            <Link href="/orders" {...navLink('/orders')}>
              <ClipboardList className="w-4 h-4" /> Orders
            </Link>
          )}
          {user?.role === 'admin' || user?.role === 'super_admin' ? (
            <Link href="/admin" className="hover:text-brand-600">Admin</Link>
          ) : null}
          {['pharmacist_rx', 'pharmacist_pack', 'delivery'].includes(user?.role ?? '') ? (
            <Link href={staffHome(user?.role)} className="hover:text-brand-600">
              {user?.role === 'delivery' ? 'Run sheet' : 'Fulfilment'}
            </Link>
          ) : null}
          {user?.role === 'partner' ? (
            <Link href="/partner" className="hover:text-brand-600">Partner portal</Link>
          ) : null}
          {user?.role === 'doctor' ? (
            <Link href="/doctor" className="hover:text-brand-600">My Portal</Link>
          ) : null}
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-3 h-16">
          {/* Cart */}
          <Link href="/cart" aria-label={cartCount > 0 ? `Cart, ${cartCount} item${cartCount === 1 ? '' : 's'}` : 'Cart'} className="relative p-2 hover:bg-gray-100 rounded-lg">
            <ShoppingCart className="w-5 h-5 text-gray-600" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-brand-600 text-white
                               text-xs rounded-full flex items-center justify-center font-medium">
                {cartCount}
              </span>
            )}
          </Link>

          {/* Auth */}
          {isAuthenticated ? (
            <div className="flex items-center gap-2">
              <Link href="/account" aria-label="My account" className="flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-brand-600">
                <User className="w-4 h-4" />
                <span className="hidden md:block">{user?.full_name?.split(' ')[0]}</span>
              </Link>
              <button
                onClick={handleLogout}
                aria-label="Sign out"
                className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-red-500"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <Link href="/auth/login" className="btn-primary text-sm py-2 px-4">
              Login
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
