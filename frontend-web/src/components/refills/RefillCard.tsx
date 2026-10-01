'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { Mandate, Refill } from '@/lib/refills';
import { useRefillActions } from '@/hooks/useRefills';
import StatusBadge from '@/components/admin/StatusBadge';
import RefillItemsEditor from './RefillItemsEditor';
import RefillFrequencyEditor from './RefillFrequencyEditor';
import RefillMandatePicker from './RefillMandatePicker';
import { formatDateIST } from '@/lib/dates';

type Editing = 'none' | 'items' | 'frequency';

export default function RefillCard({ refill: r, mandates }: { refill: Refill; mandates: Mandate[] }) {
  const { update, cancel } = useRefillActions();
  const [editing, setEditing] = useState<Editing>('none');
  const busy = update.isPending || cancel.isPending;
  const patch = (changes: Parameters<typeof update.mutate>[0]['changes'], message?: string) =>
    update.mutate({ id: r.id, changes, message }, { onSuccess: () => setEditing('none') });

  const confirmCancel = () => {
    if (window.confirm('Cancel this refill? No more refill orders will be placed.')) cancel.mutate(r.id);
  };

  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
        <div>
          <p className="font-semibold text-sm">Every {r.frequency_days} days</p>
          <p className="text-xs text-gray-500">
            {r.is_active ? `Next refill ${formatDateIST(r.next_refill_date)}` : 'Paused'}
            {r.source_order_number && (
              <>
                {' · from '}
                <Link href={`/orders/${r.order_id}`} className="text-brand-600 hover:underline">
                  {r.source_order_number}
                </Link>
              </>
            )}
            {r.last_order_id && (
              <>
                {' · '}
                <Link href={`/orders/${r.last_order_id}`} className="text-brand-600 hover:underline">
                  last refill order
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex gap-1">
          <StatusBadge status={r.is_active ? 'active' : 'paused'} />
          {r.auto_charge && <StatusBadge status="active" label="auto-pay" />}
        </div>
      </div>

      {editing === 'items' ? (
        <RefillItemsEditor
          items={r.items}
          pending={update.isPending}
          onCancel={() => setEditing('none')}
          onSave={(items) => patch({ items }, 'Items updated')}
        />
      ) : (
        <ul className="text-sm text-gray-700 mb-2">
          {r.items.map((i) => (
            <li key={i.product_id} className="flex justify-between py-0.5">
              <span className="truncate">{i.name}</span>
              <span className="text-gray-500">× {i.quantity}</span>
            </li>
          ))}
        </ul>
      )}

      {editing === 'frequency' && (
        <RefillFrequencyEditor
          current={r.frequency_days}
          pending={update.isPending}
          onCancel={() => setEditing('none')}
          onSave={(frequency_days) => patch({ frequency_days }, 'Frequency updated')}
        />
      )}

      <div className="mt-2">
        <RefillMandatePicker
          refill={r}
          mandates={mandates}
          disabled={busy}
          onChange={(mandate_id) =>
            patch({ mandate_id }, mandate_id ? 'Automatic payment attached' : 'You will get a link to pay')
          }
        />
      </div>

      {editing === 'none' && (
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100 text-xs">
          <button
            disabled={busy}
            onClick={() => patch({ is_active: !r.is_active }, r.is_active ? 'Refill paused' : 'Refill resumed')}
            className="btn-outline text-xs py-1.5 px-3"
          >
            {r.is_active ? 'Pause' : 'Resume'}
          </button>
          <button onClick={() => setEditing('frequency')} className="btn-outline text-xs py-1.5 px-3">
            Change frequency
          </button>
          <button onClick={() => setEditing('items')} className="btn-outline text-xs py-1.5 px-3">
            Edit items
          </button>
          <button
            disabled={busy}
            onClick={confirmCancel}
            className="border border-red-500 text-red-600 px-3 py-1.5 rounded-lg font-medium hover:bg-red-50 ml-auto"
          >
            Cancel refill
          </button>
        </div>
      )}
    </div>
  );
}
