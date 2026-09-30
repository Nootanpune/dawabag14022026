'use client';
import Link from 'next/link';
import { ShoppingCart, User, LogOut, ClipboardList, Home } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useCartStore } from '@/store/cartStore';
import { useRouter } from 'next/navigation';

export default function Header() {
  const { user, isAuthenticated, logout } = useAuthStore();
  const { items } = useCartStore();
  const router = useRouter();
  const cartCount = items.reduce((s, i) => s + i.quantity, 0);

  const handleLogout = async () => {
    await logout();
    router.push('/auth/login');
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">D</span>
          </div>
          <span className="text-xl font-bold text-brand-600 tracking-tight">dawabag</span>
        </Link>

        {/* Nav */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600">
          <Link href="/" className="hover:text-brand-600 flex items-center gap-1">
            <Home className="w-4 h-4" /> Home
          </Link>
          {isAuthenticated && (
            <Link href="/orders" className="hover:text-brand-600 flex items-center gap-1">
              <ClipboardList className="w-4 h-4" /> Orders
            </Link>
          )}
          {user?.role === 'admin' || user?.role === 'super_admin' ? (
            <Link href="/admin" className="hover:text-brand-600">Admin</Link>
          ) : null}
          {user?.role === 'doctor' ? (
            <Link href="/doctor/dashboard" className="hover:text-brand-600">My Portal</Link>
          ) : null}
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-3">
          {/* Cart */}
          <Link href="/cart" className="relative p-2 hover:bg-gray-100 rounded-lg">
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
              <Link href="/account" className="flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-brand-600">
                <User className="w-4 h-4" />
                <span className="hidden md:block">{user?.full_name?.split(' ')[0]}</span>
              </Link>
              <button
                onClick={handleLogout}
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
