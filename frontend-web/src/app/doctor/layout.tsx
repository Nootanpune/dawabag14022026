import type { ReactNode } from 'react';
import RequireAuth from '@/components/auth/RequireAuth';
import DoctorShell from '@/components/telemedicine/doctor/DoctorShell';
import { DOCTOR_ROLES } from '@/lib/telemedicine/roles';

/** Doctor portal — teleconsultation doctors only (role 'doctor'; C-22). */
export default function DoctorLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth roles={DOCTOR_ROLES}>
      <DoctorShell>{children}</DoctorShell>
    </RequireAuth>
  );
}
