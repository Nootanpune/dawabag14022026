'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import AdminNav from './AdminNav';

interface Props {
  children: ReactNode;
  /** header label and logo link; the staff fulfilment area reuses this shell */
  section?: string;
  homeHref?: string;
}

export default function AdminShell({ children, section = 'Admin', homeHref = '/admin' }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    await logout();
    queryClient.clear();
    router.push('/auth/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 md:px-6 h-14 flex items-center justify-between">
        <Link href={homeHref} className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">D</span>
          </div>
          <span className="text-xl font-bold text-brand-600">dawabag</span>
          <span className="text-sm text-gray-400 hidden md:block">/ {section}</span>
        </Link>
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <span className="hidden sm:block">
            {user?.full_name} <span className="text-xs text-gray-400">({user?.role})</span>
          </span>
          <button
            onClick={handleLogout}
            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-red-500"
            aria-label="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>
      <div className="max-w-7xl mx-auto px-4 py-4 md:py-6 flex flex-col md:flex-row gap-4 md:gap-6">
        <aside className="md:w-56 shrink-0">
          <AdminNav />
        </aside>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
