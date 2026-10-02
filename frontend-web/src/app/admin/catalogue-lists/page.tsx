'use client';
import { useState } from 'react';
import PageHeader from '@/components/admin/PageHeader';
import StatusTabs from '@/components/admin/StatusTabs';
import CategoriesTab from '@/components/admin/catalogueLists/CategoriesTab';
import HsnTab from '@/components/admin/catalogueLists/HsnTab';
import { useAuthStore } from '@/store/authStore';
import { hasRole, MANAGER_ROLES } from '@/lib/admin/roles';

const TABS = [{ value: 'categories', label: 'Categories' }, { value: 'hsn', label: 'HSN codes' }] as const;
type Tab = typeof TABS[number]['value'];

// Sprint 32 — Admin → Catalogue lists. Admins rename, correct and switch entries off / on
// (every change audited on the server, C-46); pharmacists see the lists read-only.
export default function CatalogueListsPage() {
  const role = useAuthStore((s) => s.user?.role);
  const canEdit = hasRole(role, MANAGER_ROLES);
  const [tab, setTab] = useState<Tab>('categories');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div>
      <PageHeader title="Catalogue lists"
        subtitle={canEdit
          ? 'Categories and HSN codes offered in the product pick-lists. A switched-off entry leaves the pick-lists but stays on products that already have it.'
          : 'Categories and HSN codes offered in the product pick-lists (read-only — an admin can change them).'} />
      <StatusTabs tabs={TABS} value={tab} onChange={(v) => { setTab(v); setMessage(null); }} />
      {message && (
        <p role="status" className={`mb-3 text-sm ${message.ok ? 'text-brand-700' : 'text-red-600'}`} data-testid="lists-message">{message.text}</p>
      )}
      {tab === 'categories'
        ? <CategoriesTab canEdit={canEdit} onMessage={setMessage} />
        : <HsnTab canEdit={canEdit} onMessage={setMessage} />}
    </div>
  );
}
