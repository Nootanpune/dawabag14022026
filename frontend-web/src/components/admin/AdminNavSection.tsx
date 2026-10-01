'use client';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NavSection } from '@/lib/admin/navSections';

interface Props {
  section: NavSection;
  open: boolean;
  onToggle: () => void;
  isActive: (href: string) => boolean;
}

/** One collapsible group of the admin menu. */
export default function AdminNavSection({ section, open, onToggle, isActive }: Props) {
  const listId = `admin-nav-${section.title.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={listId}
        className="w-full flex items-center justify-between px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700"
      >
        {section.title}
        <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', !open && '-rotate-90')} aria-hidden="true" />
      </button>
      {open && (
        <ul id={listId} className="mt-1 space-y-0.5">
          {section.items.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium',
                    active ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:bg-gray-100'
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" /> {label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
