'use client';
import { useState } from 'react';
import type { PurchaseReturn } from '@/lib/purchaseReturns/types';
import { creditDifferenceText } from '@/lib/purchaseReturns/labels';
import { PURCHASE_ADMIN_ROLES } from '@/lib/purchasing/roles';
import { hasRole } from '@/lib/admin/roles';
import { useAuthStore } from '@/store/authStore';
import DecideReturnDialog from './DecideReturnDialog';
import DispatchReturnDialog from './DispatchReturnDialog';
import SettleReturnDialog from './SettleReturnDialog';

type Open = 'approve' | 'reject' | 'dispatch' | 'settle' | null;

/**
 * Next step for the return by status. Approval is by an admin other than the
 * requester (C-46) — the server refuses with 403 otherwise, so the buttons are hidden.
 */
export default function ReturnActions({ r }: { r: PurchaseReturn }) {
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState<Open>(null);
  const [difference, setDifference] = useState<number | null>(null);
  const isAdmin = hasRole(user?.role, PURCHASE_ADMIN_ROLES);
  const ownRequest = !!user?.id && user.id === r.requested_by;

  return (
    <div className="mb-4 space-y-2">
      {r.status === 'requested' && (
        <div className="card text-sm flex flex-wrap items-center justify-between gap-3">
          <p className="text-gray-600">
            Stock leaves the batches when the return is approved. Two people: the requester and a different admin as approver.
          </p>
          {isAdmin && !ownRequest ? (
            <div className="flex gap-2">
              <button onClick={() => setOpen('approve')} className="btn-primary text-xs py-1.5 px-3">
                Approve
              </button>
              <button
                onClick={() => setOpen('reject')}
                className="border border-red-500 text-red-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-50"
              >
                Reject
              </button>
            </div>
          ) : (
            <p className="text-xs text-gray-400">{ownRequest ? 'You raised this return; another admin must decide it.' : 'Awaiting an admin’s decision.'}</p>
          )}
        </div>
      )}
      {r.status === 'approved' && (
        <div className="card text-sm flex flex-wrap items-center justify-between gap-3">
          <p className="text-gray-600">Approved — the stock is out of the batches. Send the goods and record the dispatch reference.</p>
          {/* Hand-over by someone other than the requester (C-46; server 403) */}
          {ownRequest ? (
            <p className="text-xs text-gray-400">You raised this return; someone else must hand it over.</p>
          ) : (
            <button onClick={() => setOpen('dispatch')} className="btn-primary text-xs py-1.5 px-3">
              Dispatch
            </button>
          )}
        </div>
      )}
      {r.status === 'dispatched' && (
        <div className="card text-sm flex flex-wrap items-center justify-between gap-3">
          <p className="text-gray-600">Waiting for the supplier&apos;s credit note.</p>
          {isAdmin && (
            <button onClick={() => setOpen('settle')} className="btn-primary text-xs py-1.5 px-3">
              Record supplier credit note
            </button>
          )}
        </div>
      )}
      {difference != null && difference !== 0 && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          Supplier credit is {creditDifferenceText(difference)} against the return total.
        </p>
      )}
      {(open === 'approve' || open === 'reject') && <DecideReturnDialog r={r} approve={open === 'approve'} onClose={() => setOpen(null)} />}
      {open === 'dispatch' && <DispatchReturnDialog r={r} onClose={() => setOpen(null)} />}
      {open === 'settle' && <SettleReturnDialog r={r} onClose={() => setOpen(null)} onSettled={setDifference} />}
    </div>
  );
}
