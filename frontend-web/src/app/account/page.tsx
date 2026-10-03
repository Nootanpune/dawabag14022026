'use client';
import Link from 'next/link';
import { ClipboardList, FileUp, Repeat, ChevronRight, MessageSquareWarning, ShieldCheck, MapPin, Undo2, HeartPulse, FileText, Stethoscope, BadgeCheck, AlarmClock, Activity } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import Header from '@/components/layout/Header';
import RegistrationStatusCard from '@/components/practitioner/RegistrationStatusCard';

// Business and doctor accounts keep their drug licences here (Sprint 30)
const LICENCE_TYPES = ['b2b_retailer', 'b2b_wholesaler', 'doc_hospital'];

const LINKS = [
  { href: '/orders', label: 'My orders', icon: ClipboardList },
  { href: '/prescriptions', label: 'Prescriptions', icon: FileUp },
  { href: '/account/addresses', label: 'Saved addresses', icon: MapPin },
  { href: '/account/returns', label: 'Returns & refunds', icon: Undo2 },
  { href: '/account/refills', label: 'Refills & automatic payment', icon: Repeat },
  // Sprint 33: dose reminders and the health profile (consent, C-41)
  { href: '/account/medicines', label: 'My medicines (dose reminders)', icon: AlarmClock },
  { href: '/account/health', label: 'Health profile', icon: Activity },
  { href: '/account/consultations', label: 'Doctor consultations', icon: Stethoscope },
  { href: '/account/side-effects', label: 'Side-effect reports', icon: HeartPulse },
  { href: '/account/complaints', label: 'Complaints', icon: MessageSquareWarning },
  { href: '/account/privacy', label: 'Privacy and your data', icon: ShieldCheck },
  { href: '/policies', label: 'Policies', icon: FileText },
];

export default function AccountPage() {
  const user = useAuthStore((s) => s.user);
  const links = LICENCE_TYPES.includes(user?.customer_type ?? '')
    ? [{ href: '/account/licences', label: 'Your drug licences', icon: BadgeCheck }, ...LINKS] : LINKS;
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-lg font-semibold">{user?.full_name ?? 'My account'}</h1>
        <p className="text-sm text-gray-500 mb-4">+91 {user?.mobile}</p>
        {/* Sprint 44: a doctor's / institution's registration as Dawabag verified it (r.65(9)(b)) */}
        {user?.customer_type === 'doc_hospital' && <RegistrationStatusCard />}
        <div className="card p-0 divide-y divide-gray-100">
          {links.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-gray-50">
              <Icon className="w-4 h-4 text-brand-600" />
              <span className="flex-1">{label}</span>
              <ChevronRight className="w-4 h-4 text-gray-300" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
