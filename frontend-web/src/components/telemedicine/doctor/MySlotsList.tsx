'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { blockSlot, doctorKeys, fetchMySlots } from '@/lib/telemedicine/doctorApi';
import { formatSlotDate, formatSlotTime } from '@/lib/telemedicine/labels';
import { addDays, groupByDay } from '@/lib/telemedicine/slots';
import type { OwnSlot } from '@/lib/telemedicine/types';
import { todayIST } from '@/lib/fulfilment/roles';
import { getApiErrorMessage } from '@/lib/apiErrors';
import QueryState from '@/components/admin/QueryState';

function SlotState({ s }: { s: OwnSlot }) {
  if (s.is_booked) {
    return s.consultation_id ? (
      <Link href={`/doctor/consultations/${s.consultation_id}/prescribe`} className="text-xs font-medium text-brand-600 hover:underline">
        Booked · open
      </Link>
    ) : (
      <span className="text-xs font-medium text-brand-600">Booked</span>
    );
  }
  return <span className="text-xs text-gray-400">Blocked</span>;
}

/** The doctor's own slots in a date range (booked and blocked shown); only free slots can be blocked. */
export default function MySlotsList() {
  const queryClient = useQueryClient();
  const [from, setFrom] = useState(todayIST());
  const [to, setTo] = useState(addDays(todayIST(), 6));
  const { data, isLoading, error } = useQuery({
    queryKey: doctorKeys.slots(from, to),
    queryFn: () => fetchMySlots(from, to),
    enabled: !!from && !!to && from <= to,
  });
  const block = useMutation({
    mutationFn: blockSlot,
    onSuccess: () => toast.success('Slot blocked'),
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not block the slot')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: doctorKeys.all }),
  });
  return (
    <div className="card text-sm space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="font-semibold">My slots</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input max-w-[11rem]" aria-label="From" />
          <span className="text-gray-400">to</span>
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="input max-w-[11rem]" aria-label="To" />
        </div>
      </div>
      {from > to ? (
        <p className="text-xs text-red-600">&quot;From&quot; must be on or before &quot;to&quot;</p>
      ) : (
        <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No slots in these dates" />
      )}
      {!!data?.length &&
        groupByDay(data).map(([day, slots]) => (
          <div key={day}>
            <h3 className="text-xs font-semibold text-gray-500 mb-1">{formatSlotDate(day)}</h3>
            <ul className="divide-y divide-gray-100">
              {slots.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2">
                  <span className={s.is_blocked ? 'text-gray-400 line-through' : ''}>
                    {formatSlotTime(s.slot_start)} – {formatSlotTime(s.slot_end)}
                  </span>
                  {s.is_booked || s.is_blocked ? (
                    <SlotState s={s} />
                  ) : (
                    <button
                      onClick={() => block.mutate(s.id)}
                      disabled={block.isPending}
                      className="btn-outline text-xs py-1 px-3 inline-flex items-center gap-1 text-red-600"
                    >
                      {block.isPending && block.variables === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ban className="w-3 h-3" />} Block
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      <p className="text-xs text-gray-400">Only free slots can be blocked; cancel a booked consultation from Consultations.</p>
    </div>
  );
}
