// Admin / staff side menu, grouped into seven sections. Every link keeps its
// href and role list; AdminNav shows only the links the signed-in role may open.
import type { LucideIcon } from 'lucide-react';
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
  AlertOctagon,
  Images,
  Store,
  ListPlus,
  BookOpenCheck,
  Radio,
  OctagonPause,
  Link2,
  Globe,
  IdCard,
  Waypoints,
} from 'lucide-react';
import { MANAGER_ROLES, ADMIN_ROLES, PHARMACIST_ROLES } from '@/lib/admin/roles';
import { FULFILMENT_QUEUE_ROLES, RIDER_ROLES } from '@/lib/fulfilment/roles';
import { STORE_ROLES } from '@/lib/purchasing/roles';
import { DOCTOR_ADMIN_ROLES, TELE_LIST_ROLES } from '@/lib/telemedicine/roles';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: readonly string[];
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Orders',
    items: [
      { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, roles: MANAGER_ROLES },
      { href: '/staff/fulfilment', label: 'Fulfilment', icon: PackageCheck, roles: FULFILMENT_QUEUE_ROLES },
      // Sprint 13 — Dawabag's own riders work from their run sheet (C-26, C-41)
      { href: '/staff/run-sheet', label: 'Run sheet', icon: Truck, roles: RIDER_ROLES },
      { href: '/admin/deliveries', label: 'Deliveries', icon: Send, roles: MANAGER_ROLES },
      { href: '/admin/returns', label: 'Returns', icon: Undo2, roles: ADMIN_ROLES },
      { href: '/staff/returns', label: 'Returns', icon: Undo2, roles: ['pharmacist_pack'] },
      { href: '/admin/refunds', label: 'Refunds', icon: Banknote, roles: MANAGER_ROLES },
    ],
  },
  {
    title: 'Catalogue & stock',
    items: [
      { href: '/admin/products', label: 'Products', icon: Package, roles: MANAGER_ROLES },
      { href: '/admin/catalogue-import', label: 'Catalogue import', icon: FileSpreadsheet, roles: MANAGER_ROLES },
      // Sprint 22 — bulk pack photos by SKU; each photo goes to pharmacist review (C-19)
      { href: '/admin/products/photos', label: 'Pack photos', icon: Images, roles: MANAGER_ROLES },
      { href: '/staff/content-review', label: 'Product copy', icon: ClipboardCheck, roles: PHARMACIST_ROLES },
      // Sprint 36 — medicine information approved by a second pharmacist (four eyes, C-19)
      { href: '/staff/medicine-info-approvals', label: 'Medicine information to approve', icon: BookOpenCheck, roles: PHARMACIST_ROLES },
      // Sprint 29 — draft products from partner requests, completed and approved by the pharmacist
      { href: '/staff/new-products', label: 'New products to complete', icon: ListPlus, roles: PHARMACIST_ROLES },
      // Sprint 39 — online-sale status per product: a pharmacist allows (dated reference); pharmacists / admins stop (C-10)
      { href: '/staff/online-sale', label: 'Online-sale status', icon: Globe, roles: PHARMACIST_ROLES },
      // Sprint 32 — rename / correct / switch off categories and HSN codes (admins; pharmacists read-only)
      { href: '/admin/catalogue-lists', label: 'Catalogue lists', icon: ListTree, roles: PHARMACIST_ROLES },
      // Sprint 28 — Dawabag's admin adds partner pharmacies directly (licences, pharmacists, logins)
      { href: '/admin/partners', label: 'Partners', icon: Store, roles: MANAGER_ROLES },
      { href: '/admin/listings', label: 'Partner listings', icon: ListChecks, roles: ADMIN_ROLES },
      // Sprint 27 — partners' stock files and the items they ask Dawabag to add
      { href: '/admin/partner-stock', label: 'Partner stock files', icon: PackagePlus, roles: MANAGER_ROLES },
      // Sprint 37 — partners' billing software sending stock live; items waiting are URGENT (badge)
      { href: '/admin/stock-feeds', label: 'Live stock feeds', icon: Radio, roles: MANAGER_ROLES },
      { href: '/admin/stock', label: 'Low stock', icon: PackageX, roles: MANAGER_ROLES },
      { href: '/staff/stock', label: 'Stock', icon: Boxes, roles: STORE_ROLES },
      { href: '/admin/stock-adjustments', label: 'Stock adjustments', icon: SlidersHorizontal, roles: MANAGER_ROLES },
      { href: '/staff/stock-counts', label: 'Stock counts', icon: ClipboardList, roles: STORE_ROLES },
    ],
  },
  {
    title: 'Purchasing',
    items: [
      // Sprint 7 — purchasing and stock control (C-02 licensed suppliers, C-46 two-person approvals)
      { href: '/admin/suppliers', label: 'Suppliers', icon: Factory, roles: MANAGER_ROLES },
      { href: '/admin/purchase-orders', label: 'Purchase orders', icon: ShoppingCart, roles: MANAGER_ROLES },
      { href: '/staff/receive', label: 'Receive goods', icon: PackagePlus, roles: STORE_ROLES },
      // Sprint 9 — purchase returns to suppliers (C-28, two-person approval C-46)
      { href: '/staff/purchase-returns', label: 'Purchase returns', icon: PackageMinus, roles: STORE_ROLES },
      { href: '/admin/vendors', label: 'Vendors', icon: Truck, roles: MANAGER_ROLES },
    ],
  },
  {
    title: 'Compliance',
    items: [
      { href: '/admin/kyc', label: 'KYC review', icon: ShieldCheck, roles: ADMIN_ROLES },
      { href: '/admin/recalls', label: 'Batch recalls', icon: ShieldAlert, roles: MANAGER_ROLES },
      // Sprint 14 — regulator recall / NSQ alerts, 4-hour decision deadline (C-28)
      { href: '/admin/recall-alerts', label: 'Recall alerts', icon: AlertOctagon, roles: MANAGER_ROLES },
      { href: '/staff/adverse-events', label: 'Side effects', icon: HeartPulse, roles: PHARMACIST_ROLES },
      { href: '/staff/destruction-register', label: 'Destruction register', icon: Flame, roles: STORE_ROLES },
      { href: '/staff/telemedicine-lists', label: 'Telemedicine lists', icon: ListTree, roles: TELE_LIST_ROLES },
      { href: '/admin/licences', label: 'Licences', icon: BadgeCheck, roles: MANAGER_ROLES },
      // Sprint 39 — pharmacist registration validity (C-03) and who supplied each partner batch (C-02, C-28)
      { href: '/admin/pharmacist-registrations', label: 'Pharmacist registrations', icon: IdCard, roles: MANAGER_ROLES },
      { href: '/admin/partner-provenance', label: 'Partner batch suppliers', icon: Waypoints, roles: MANAGER_ROLES },
      // Sprint 38 — emergency stop for prescription-medicine sales (super-admin acts) and the chain checks (C-08, C-09, C-46)
      { href: '/admin/emergency-stop', label: 'Emergency stop', icon: OctagonPause, roles: MANAGER_ROLES },
      { href: '/admin/integrity', label: 'Record integrity', icon: Link2, roles: MANAGER_ROLES },
      { href: '/admin/policies', label: 'Policies', icon: FileText, roles: MANAGER_ROLES },
      // Sprint 33 — "Genuine medicines", "Expired, damaged and recalled", "Every order is checked by a pharmacist"
      { href: '/admin/info-pages', label: 'Trust pages', icon: BookOpenCheck, roles: MANAGER_ROLES },
    ],
  },
  {
    title: 'Finance',
    items: [
      { href: '/admin/settlements', label: 'Settlements', icon: Wallet, roles: MANAGER_ROLES },
      { href: '/admin/credit', label: 'Credit', icon: IndianRupee, roles: MANAGER_ROLES },
      { href: '/admin/accounts', label: 'Accounts', icon: Calculator, roles: MANAGER_ROLES },
      // Sprint 9 — GST e-invoicing (IRN) for B2B invoices and credit notes (C-31)
      { href: '/admin/einvoices', label: 'E-invoices', icon: Receipt, roles: MANAGER_ROLES },
    ],
  },
  {
    title: 'People',
    items: [
      // Sprint 10 — teleconsultation: doctor registration checks (C-22) and TPG medicine lists (C-23)
      { href: '/admin/doctors', label: 'Doctors', icon: Stethoscope, roles: DOCTOR_ADMIN_ROLES },
      { href: '/admin/grievances', label: 'Complaints', icon: MessageSquareWarning, roles: ADMIN_ROLES },
      { href: '/admin/privacy', label: 'Data requests', icon: UserCog, roles: MANAGER_ROLES },
    ],
  },
  {
    title: 'System',
    items: [
      // Sprint 8 — SMS / email / push delivery log
      { href: '/admin/notifications', label: 'Notifications', icon: Bell, roles: MANAGER_ROLES },
      { href: '/admin/jobs', label: 'Jobs', icon: Timer, roles: MANAGER_ROLES },
      { href: '/admin/incidents', label: 'Security incidents', icon: Siren, roles: MANAGER_ROLES },
      { href: '/admin/settings', label: 'Settings', icon: Settings, roles: MANAGER_ROLES },
    ],
  },
];
