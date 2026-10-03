'use client';
import { useQuery } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { fetchMyRegistration, registrationKeys } from '@/lib/pharmacistRegistrations/api';

/**
 * Sprint 39 (C-03): a pharmacist whose registration is not valid, not yet recorded, or close
 * to lapsing sees why on every staff page. The server decides; nothing is stored locally.
 */
export default function RegistrationWarning() {
  const isPharmacist = useAuthStore((s) => s.user?.role) === 'pharmacist_rx';
  const { data } = useQuery({ queryKey: registrationKeys.me, queryFn: fetchMyRegistration, enabled: isPharmacist, staleTime: 60_000 });
  const s = data?.standing;
  if (!isPharmacist || !s?.message) return null;
  return (
    <div role={s.ok ? 'status' : 'alert'} data-testid="registration-warning"
      className={`mb-4 flex gap-2 rounded-lg border p-3 text-sm ${s.ok ? 'border-amber-300 bg-amber-50 text-amber-950' : 'border-red-300 bg-red-50 text-red-900'}`}>
      <ShieldAlert className="w-5 h-5 shrink-0" aria-hidden="true" />
      <p>
        <strong>{s.ok ? 'Pharmacy council registration: ' : 'You cannot verify prescriptions or check orders: '}</strong>{s.message}
      </p>
    </div>
  );
}
