'use client';
import { useState } from 'react';
import type { Mandate } from '@/lib/refills';
import { formatDate, formatPrice } from '@/lib/utils';
import { useRefillActions } from '@/hooks/useRefills';
import StatusBadge from '@/components/admin/StatusBadge';
import TurnOnAutoPayDialog from './TurnOnAutoPayDialog';

export default function AutoPaySection({ mandates }: { mandates: Mandate[] }) {
  const { removeMandate, refresh } = useRefillActions();
  const [open, setOpen] = useState(false);
  const shown = mandates.filter((m) => m.status !== 'cancelled');

  return (
    <section className="card mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h2 className="font-semibold text-sm">Automatic payment</h2>
        <button onClick={() => setOpen(true)} className="btn-primary text-xs py-1.5 px-3">
          Turn on automatic payment
        </button>
      </div>
      {shown.length ? (
        <ul className="divide-y divide-gray-100 text-sm">
          {shown.map((m) => (
            <li key={m.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">
                  {m.method.toUpperCase()} · up to {formatPrice(m.max_amount_paise)}
                </p>
                <p className="text-xs text-gray-400">
                  Set up {formatDate(m.created_at)}
                  {m.activated_at ? ` · active since ${formatDate(m.activated_at)}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={m.status} />
                <button
                  onClick={() => window.confirm('Turn off this automatic payment?') && removeMandate.mutate(m.id)}
                  disabled={removeMandate.isPending}
                  className="text-xs text-red-600 hover:underline"
                >
                  Turn off
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-gray-500">No automatic payment set up. You&apos;ll get a link to pay for each refill.</p>
      )}
      {open && <TurnOnAutoPayDialog onClose={() => setOpen(false)} onDone={refresh} />}
    </section>
  );
}
