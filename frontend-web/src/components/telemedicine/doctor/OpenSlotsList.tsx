'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchSlots, teleKeys } from '@/lib/telemedicine/api';
import { blockSlot } from '@/lib/telemedicine/doctorApi';
import { formatSlotTime } from '@/lib/telemedicine/labels';
import { todayIST } from '@/lib/fulfilment/roles';
import { getApiErrorMessage } from '@/lib/apiErrors';
import QueryState from '@/components/admin/QueryState';

/** The doctor's free slots on one day (as patients see them) with a Block button. */
export default function OpenSlotsList({ doctorId }: { doctorId: string }) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayIST());
  const { data, isLoading, error } = useQuery({ queryKey: teleKeys.slots(doctorId, date), queryFn: () => fetchSlots(doctorId, date) });
  const block = useMutation({
    mutationFn: blockSlot,
    onSuccess: () => toast.success('Slot blocked'),
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not block the slot')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: teleKeys.slots(doctorId, date) }),
  });
  return (
    <div className="card text-sm space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="font-semibold">Free slots</h2>
        <input type="date" value={date} min={todayIST()} onChange={(e) => setDate(e.target.value)} className="input max-w-[11rem]" />
      </div>
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No free slots on this day" />
      {!!data?.length && (
        <ul className="divide-y divide-gray-100">
          {data.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2">
              <span>
                {formatSlotTime(s.slot_start)} – {formatSlotTime(s.slot_end)}
              </span>
              <button
                onClick={() => block.mutate(s.id)}
                disabled={block.isPending}
                className="btn-outline text-xs py-1 px-3 inline-flex items-center gap-1 text-red-600"
              >
                {block.isPending && block.variables === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ban className="w-3 h-3" />} Block
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-gray-400">Booked slots are not listed here; cancel those from Consultations.</p>
    </div>
  );
}
