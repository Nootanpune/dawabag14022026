'use client';
import Link from 'next/link';
import { ClipboardList, Repeat, ChevronRight, MessageSquareWarning, ShieldCheck, MapPin, Undo2, HeartPulse, FileText } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import Header from '@/components/layout/Header';

const LINKS = [
  { href: '/orders', label: 'My orders', icon: ClipboardList },
  { href: '/account/addresses', label: 'Saved addresses', icon: MapPin },
  { href: '/account/returns', label: 'Returns & refunds', icon: Undo2 },
  { href: '/account/refills', label: 'Refills & automatic payment', icon: Repeat },
  { href: '/account/side-effects', label: 'Side-effect reports', icon: HeartPulse },
  { href: '/account/complaints', label: 'Complaints', icon: MessageSquareWarning },
  { href: '/account/privacy', label: 'Privacy and your data', icon: ShieldCheck },
  { href: '/policies', label: 'Policies', icon: FileText },
];

export default function AccountPage() {
  const user = useAuthStore((s) => s.user);
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-lg font-semibold">{user?.full_name ?? 'My account'}</h1>
        <p className="text-sm text-gray-500 mb-4">+91 {user?.mobile}</p>
        <div className="card p-0 divide-y divide-gray-100">
          {LINKS.map(({ href, label, icon: Icon }) => (
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
