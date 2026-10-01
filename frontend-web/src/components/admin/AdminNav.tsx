'use client';
import { useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, Search } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { hasRole } from '@/lib/admin/roles';
import { NAV_SECTIONS } from '@/lib/admin/navSections';
import AdminNavSection from './AdminNavSection';

/** Grouped side menu with a quick filter; only links the signed-in role may open. */
export default function AdminNav() {
  const pathname = usePathname();
  const role = useAuthStore((s) => s.user?.role);
  const [filter, setFilter] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [mobileOpen, setMobileOpen] = useState(false);

  const sections = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return NAV_SECTIONS.map((s) => ({
      ...s,
      items: s.items.filter((i) => hasRole(role, i.roles) && (!q || i.label.toLowerCase().includes(q))),
    })).filter((s) => s.items.length > 0);
  }, [role, filter]);

  // exact segment match so /admin/stock is not active on /admin/stock-adjustments
  const isActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : pathname === href || !!pathname?.startsWith(`${href}/`);

  const toggle = (title: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });

  return (
    <div>
      <button
        type="button"
        onClick={() => setMobileOpen((o) => !o)}
        aria-expanded={mobileOpen}
        aria-controls="admin-nav"
        className="md:hidden w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700"
      >
        <Menu className="w-4 h-4" aria-hidden="true" /> Menu
      </button>
      <nav id="admin-nav" aria-label="Admin" className={mobileOpen ? 'mt-2 md:mt-0' : 'hidden md:block'}>
        <div className="relative mb-3">
          <label htmlFor="admin-nav-filter" className="sr-only">
            Filter menu
          </label>
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" aria-hidden="true" />
          <input
            id="admin-nav-filter"
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Find a page"
            className="input pl-8 py-1.5"
          />
        </div>
        {sections.length === 0 && <p className="text-xs text-gray-500 px-3">No menu item matches.</p>}
        <div className="space-y-3">
          {sections.map((s) => (
            <AdminNavSection
              key={s.title}
              section={s}
              // a filter always shows its matches
              open={!!filter.trim() || !collapsed.has(s.title)}
              onToggle={() => toggle(s.title)}
              isActive={isActive}
            />
          ))}
        </div>
      </nav>
    </div>
  );
}
