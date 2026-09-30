'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ShieldCheck,
  Truck,
  PackageX,
  IndianRupee,
  Timer,
  ListChecks,
  Wallet,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { hasRole, MANAGER_ROLES, ADMIN_ROLES } from '@/lib/admin/roles';

const ITEMS = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, roles: MANAGER_ROLES },
  { href: '/admin/kyc', label: 'KYC review', icon: ShieldCheck, roles: ADMIN_ROLES },
  { href: '/admin/vendors', label: 'Vendors', icon: Truck, roles: MANAGER_ROLES },
  { href: '/admin/listings', label: 'Partner listings', icon: ListChecks, roles: ADMIN_ROLES },
  { href: '/admin/settlements', label: 'Settlements', icon: Wallet, roles: MANAGER_ROLES },
  { href: '/admin/stock', label: 'Low stock', icon: PackageX, roles: MANAGER_ROLES },
  { href: '/admin/credit', label: 'Credit', icon: IndianRupee, roles: MANAGER_ROLES },
  { href: '/admin/jobs', label: 'Jobs', icon: Timer, roles: MANAGER_ROLES },
  { href: '/admin/settings', label: 'Settings', icon: Settings, roles: MANAGER_ROLES },
];

export default function AdminNav() {
  const pathname = usePathname();
  const role = useAuthStore((s) => s.user?.role);
  const items = ITEMS.filter((i) => hasRole(role, i.roles));

  return (
    <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === '/admin' ? pathname === '/admin' : pathname?.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap',
              active ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:bg-gray-100'
            )}
          >
            <Icon className="w-4 h-4" /> {label}
          </Link>
        );
      })}
    </nav>
  );
}
