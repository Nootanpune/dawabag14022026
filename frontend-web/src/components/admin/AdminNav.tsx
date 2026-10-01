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
  PackageCheck,
  MessageSquareWarning,
  ShieldAlert,
  UserCog,
  Undo2,
  Banknote,
  FileText,
  BadgeCheck,
  Send,
  ClipboardCheck,
  HeartPulse,
  Package,
  FileSpreadsheet,
  Calculator,
  Siren,
  Factory,
  ShoppingCart,
  PackagePlus,
  Boxes,
  SlidersHorizontal,
  Flame,
  ClipboardList,
  Bell,
  PackageMinus,
  Receipt,
  Stethoscope,
  ListTree,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { hasRole, MANAGER_ROLES, ADMIN_ROLES, PHARMACIST_ROLES } from '@/lib/admin/roles';
import { FULFILMENT_ROLES } from '@/lib/fulfilment/roles';
import { STORE_ROLES } from '@/lib/purchasing/roles';
import { DOCTOR_ADMIN_ROLES, TELE_LIST_ROLES } from '@/lib/telemedicine/roles';

const ITEMS = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, roles: MANAGER_ROLES },
  { href: '/staff/fulfilment', label: 'Fulfilment', icon: PackageCheck, roles: FULFILMENT_ROLES },
  { href: '/admin/deliveries', label: 'Deliveries', icon: Send, roles: MANAGER_ROLES },
  { href: '/admin/returns', label: 'Returns', icon: Undo2, roles: ADMIN_ROLES },
  { href: '/staff/returns', label: 'Returns', icon: Undo2, roles: ['pharmacist_pack'] },
  { href: '/admin/refunds', label: 'Refunds', icon: Banknote, roles: MANAGER_ROLES },
  { href: '/staff/content-review', label: 'Product copy', icon: ClipboardCheck, roles: PHARMACIST_ROLES },
  { href: '/staff/adverse-events', label: 'Side effects', icon: HeartPulse, roles: PHARMACIST_ROLES },
  // Sprint 10 — teleconsultation: doctor registration checks (C-22) and TPG medicine lists (C-23)
  { href: '/admin/doctors', label: 'Doctors', icon: Stethoscope, roles: DOCTOR_ADMIN_ROLES },
  { href: '/staff/telemedicine-lists', label: 'Telemedicine lists', icon: ListTree, roles: TELE_LIST_ROLES },
  { href: '/admin/kyc', label: 'KYC review', icon: ShieldCheck, roles: ADMIN_ROLES },
  { href: '/admin/grievances', label: 'Complaints', icon: MessageSquareWarning, roles: ADMIN_ROLES },
  { href: '/admin/recalls', label: 'Batch recalls', icon: ShieldAlert, roles: MANAGER_ROLES },
  { href: '/admin/privacy', label: 'Data requests', icon: UserCog, roles: MANAGER_ROLES },
  { href: '/admin/vendors', label: 'Vendors', icon: Truck, roles: MANAGER_ROLES },
  { href: '/admin/listings', label: 'Partner listings', icon: ListChecks, roles: ADMIN_ROLES },
  { href: '/admin/settlements', label: 'Settlements', icon: Wallet, roles: MANAGER_ROLES },
  { href: '/admin/products', label: 'Products', icon: Package, roles: MANAGER_ROLES },
  { href: '/admin/catalogue-import', label: 'Catalogue import', icon: FileSpreadsheet, roles: MANAGER_ROLES },
  { href: '/admin/stock', label: 'Low stock', icon: PackageX, roles: MANAGER_ROLES },
  // Sprint 7 — purchasing and stock control (C-02 licensed suppliers, C-46 two-person approvals)
  { href: '/admin/suppliers', label: 'Suppliers', icon: Factory, roles: MANAGER_ROLES },
  { href: '/admin/purchase-orders', label: 'Purchase orders', icon: ShoppingCart, roles: MANAGER_ROLES },
  { href: '/staff/receive', label: 'Receive goods', icon: PackagePlus, roles: STORE_ROLES },
  { href: '/staff/stock', label: 'Stock', icon: Boxes, roles: STORE_ROLES },
  { href: '/admin/stock-adjustments', label: 'Stock adjustments', icon: SlidersHorizontal, roles: MANAGER_ROLES },
  { href: '/staff/stock-counts', label: 'Stock counts', icon: ClipboardList, roles: STORE_ROLES },
  // Sprint 9 — purchase returns to suppliers (C-28, two-person approval C-46)
  { href: '/staff/purchase-returns', label: 'Purchase returns', icon: PackageMinus, roles: STORE_ROLES },
  { href: '/staff/destruction-register', label: 'Destruction register', icon: Flame, roles: STORE_ROLES },
  { href: '/admin/credit', label: 'Credit', icon: IndianRupee, roles: MANAGER_ROLES },
  { href: '/admin/accounts', label: 'Accounts', icon: Calculator, roles: MANAGER_ROLES },
  // Sprint 9 — GST e-invoicing (IRN) for B2B invoices and credit notes (C-31)
  { href: '/admin/einvoices', label: 'E-invoices', icon: Receipt, roles: MANAGER_ROLES },
  // Sprint 8 — SMS / email / push delivery log
  { href: '/admin/notifications', label: 'Notifications', icon: Bell, roles: MANAGER_ROLES },
  { href: '/admin/jobs', label: 'Jobs', icon: Timer, roles: MANAGER_ROLES },
  { href: '/admin/policies', label: 'Policies', icon: FileText, roles: MANAGER_ROLES },
  { href: '/admin/incidents', label: 'Security incidents', icon: Siren, roles: MANAGER_ROLES },
  { href: '/admin/licences', label: 'Licences', icon: BadgeCheck, roles: MANAGER_ROLES },
  { href: '/admin/settings', label: 'Settings', icon: Settings, roles: MANAGER_ROLES },
];

export default function AdminNav() {
  const pathname = usePathname();
  const role = useAuthStore((s) => s.user?.role);
  const items = ITEMS.filter((i) => hasRole(role, i.roles));

  return (
    <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
      {items.map(({ href, label, icon: Icon }) => {
        // exact segment match so /admin/stock is not active on /admin/stock-adjustments
        const active = href === '/admin' ? pathname === '/admin' : pathname === href || !!pathname?.startsWith(`${href}/`);
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
