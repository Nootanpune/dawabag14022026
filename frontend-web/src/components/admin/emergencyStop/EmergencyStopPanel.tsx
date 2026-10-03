'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { OctagonPause, PlayCircle } from 'lucide-react';
import { emergencyKeys, fetchEmergencyStop } from '@/lib/emergencyStop/api';
import { useAuthStore } from '@/store/authStore';
import { formatDateTimeIST } from '@/lib/dates';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import PauseDialog from './PauseDialog';
import ResumeDialog from './ResumeDialog';
import PauseHistory from './PauseHistory';

/**
 * The emergency stop (owner decision 2026-10-03): prescription-medicine sales are open by
 * default; a super-admin can pause them at once with a reason and a reference, and resume
 * with one step. While paused: no Schedule H / H1 medicines in carts or checkouts for retail
 * buyers (Dawabag and every partner), a banner on the website and app, and paid parcels
 * holding them are held at dispatch until sales resume (C-08, C-46).
 */
export default function EmergencyStopPanel() {
  const isSuper = useAuthStore((s) => s.user?.role) === 'super_admin';
  const { data, isLoading, error, refetch, isFetching } = useQuery({ queryKey: emergencyKeys.admin, queryFn: fetchEmergencyStop });
  const [dialog, setDialog] = useState<'pause' | 'resume' | null>(null);
  const state = data?.state;

  return (
    <div>
      <PageHeader title="Emergency stop" onRefresh={() => refetch()} refreshing={isFetching}
        subtitle="Pause sales of prescription medicines (Schedule H / H1, retail buyers) across Dawabag and every partner — for example on a government notification." />
      <QueryState isLoading={isLoading} error={error} isEmpty={false} emptyText="" />
      {state && (
        <div className={`rounded-xl border p-4 mb-5 ${state.paused ? 'border-red-300 bg-red-50' : 'border-green-200 bg-green-50'}`} data-testid="emergency-state">
          <p className="font-semibold text-gray-900">
            {state.paused ? 'Prescription-medicine sales are PAUSED' : 'Prescription-medicine sales are open'}
          </p>
          {state.paused && (
            <dl className="text-sm text-gray-800 mt-2 grid gap-1 sm:grid-cols-[10rem_1fr]">
              <dt className="font-medium">Since</dt><dd>{state.paused_at ? formatDateTimeIST(state.paused_at) : '—'}</dd>
              <dt className="font-medium">Reference</dt><dd>{state.reference}</dd>
              <dt className="font-medium">Reason (staff only)</dt><dd>{state.reason}</dd>
              <dt className="font-medium">Buyers see</dt><dd>{data.public.message}</dd>
            </dl>
          )}
          <p className="text-xs text-gray-700 mt-2">
            {state.paused
              ? 'Paid orders are not cancelled: pharmacists can still check and pack them, but parcels holding prescription medicines are not dispatched until you resume (or staff cancel and refund).'
              : 'Pausing takes effect at once for carts, checkout, payment and dispatch. Both pausing and resuming are recorded in the audit log.'}
          </p>
          {isSuper ? (
            <div className="mt-3">
              {state.paused ? (
                <button onClick={() => setDialog('resume')} className="btn-primary text-sm inline-flex items-center gap-2">
                  <PlayCircle className="w-4 h-4" aria-hidden="true" /> Resume sales
                </button>
              ) : (
                <button onClick={() => setDialog('pause')} className="text-sm inline-flex items-center gap-2 rounded-full px-4 py-2 font-medium text-white bg-red-700 hover:bg-red-800">
                  <OctagonPause className="w-4 h-4" aria-hidden="true" /> Pause prescription-medicine sales
                </button>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-700 mt-3">Only a super-admin can pause or resume.</p>
          )}
        </div>
      )}
      {!!data?.history.length && <PauseHistory rows={data.history} />}
      {dialog === 'pause' && <PauseDialog onClose={() => setDialog(null)} />}
      {dialog === 'resume' && <ResumeDialog onClose={() => setDialog(null)} />}
    </div>
  );
}
