'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import BrandLogo from '@/components/brand/BrandLogo';
import PartnerNav from './PartnerNav';
import PartnerFeedAlert from '@/components/stockFeed/PartnerFeedAlert';

export default function PartnerShell({ children }: { children: ReactNode }) {
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
        <Link href="/partner" className="flex items-center gap-3">
          <BrandLogo height={32} priority />
          <span className="text-sm text-gray-400 hidden md:block">/ Partner</span>
        </Link>
        <div className="flex items-center gap-3 text-sm text-gray-600">
          {/* Sprint 37: URGENT — live stock-feed items waiting for a check */}
          <PartnerFeedAlert />
          <span className="hidden sm:block">{user?.full_name}</span>
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
        <aside className="md:w-48 shrink-0">
          <PartnerNav />
        </aside>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
