'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Search, ListChecks, Truck, IndianRupee, Undo2, UploadCloud, Radio, BookLock, Thermometer, Waypoints } from 'lucide-react';
import UrgentBadge from '@/components/stockFeed/UrgentBadge';
import { usePartnerFeedAlerts } from '@/components/stockFeed/PartnerFeedAlert';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/partner', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/partner/catalogue', label: 'Catalogue', icon: Search },
  { href: '/partner/listings', label: 'My listings', icon: ListChecks },
  { href: '/partner/stock-import', label: 'Upload stock', icon: UploadCloud },
  { href: '/partner/stock-feed', label: 'Live stock feed', icon: Radio },   // Sprint 37
  { href: '/partner/shipments', label: 'Shipments', icon: Truck },
  { href: '/partner/h1-register', label: 'H1 register', icon: BookLock },   // Sprint 38 (C-09)
  { href: '/partner/gdp', label: 'GDP records', icon: Thermometer },        // Sprint 40 (C-25)
  { href: '/partner/batch-suppliers', label: 'Batch suppliers', icon: Waypoints },   // Sprint 40 (C-02)
  { href: '/partner/returns', label: 'Returns', icon: Undo2 },
  { href: '/partner/settlements', label: 'Settlements', icon: IndianRupee },
];

export default function PartnerNav() {
  const pathname = usePathname();
  const alerts = usePartnerFeedAlerts();
  const waiting = alerts.data?.mode === 'live' ? alerts.data.waiting_checks : 0;
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
            {href === '/partner/stock-feed' && <UrgentBadge count={waiting} testId="nav-urgent-badge" />}
          </Link>
        );
      })}
    </nav>
  );
}
