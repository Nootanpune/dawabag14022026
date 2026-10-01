'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, Clock, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/doctor', label: 'Consultations', icon: CalendarDays },
  { href: '/doctor/slots', label: 'Slots', icon: Clock },
  { href: '/doctor/profile', label: 'Profile & registration', icon: UserRound },
];

export default function DoctorNav() {
  const pathname = usePathname();
  return (
    <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active =
          href === '/doctor'
            ? pathname === '/doctor' || !!pathname?.startsWith('/doctor/consultations') || !!pathname?.startsWith('/doctor/prescriptions')
            : !!pathname?.startsWith(href);
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
