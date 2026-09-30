'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Search, ListChecks, Truck, IndianRupee, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/partner', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/partner/catalogue', label: 'Catalogue', icon: Search },
  { href: '/partner/listings', label: 'My listings', icon: ListChecks },
  { href: '/partner/shipments', label: 'Shipments', icon: Truck },
  { href: '/partner/returns', label: 'Returns', icon: Undo2 },
  { href: '/partner/settlements', label: 'Settlements', icon: IndianRupee },
];

export default function PartnerNav() {
  const pathname = usePathname();
  return (
    <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = href === '/partner' ? pathname === '/partner' : pathname?.startsWith(href);
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
