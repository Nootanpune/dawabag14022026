'use client';
import Link from 'next/link';
import { AlertOctagon } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { hasRole, MANAGER_ROLES } from '@/lib/admin/roles';

/**
 * Shown when a receipt is refused because a batch is on a regulator recall alert
 * (409 from receiptGate, C-28). An admin checks the product and clears it on the alert.
 */
export default function RecallAlertBanner() {
  const role = useAuthStore((s) => s.user?.role);
  return (
    <div role="alert" className="flex items-start gap-2 text-sm text-red-900 bg-red-50 border border-red-200 rounded-lg p-3">
      <AlertOctagon className="w-4 h-4 mt-0.5 shrink-0" />
      <p>
        A batch is on a regulator recall alert.{' '}
        {hasRole(role, MANAGER_ROLES) ? (
          <Link href="/admin/recall-alerts" className="font-medium underline">
            Open recall alerts
          </Link>
        ) : (
          'Ask an admin to check it on the recall alerts screen'
        )}{' '}
        and clear the product if it is not the one on the alert, then save again.
      </p>
    </div>
  );
}
