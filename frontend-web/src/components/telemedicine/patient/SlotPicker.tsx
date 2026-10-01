'use client';
import { useQuery } from '@tanstack/react-query';
import { fetchSlots, teleKeys } from '@/lib/telemedicine/api';
import { formatSlotTime } from '@/lib/telemedicine/labels';
import { todayIST } from '@/lib/fulfilment/roles';
import { cn } from '@/lib/utils';
import QueryState from '@/components/admin/QueryState';

interface Props {
  doctorId: string;
  date: string;
  onDate: (d: string) => void;
  slotId: string;
  onSlot: (id: string) => void;
}

/** Open slots for one day, straight from the server (booked / blocked / past slots are not returned). */
export default function SlotPicker({ doctorId, date, onDate, slotId, onSlot }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: teleKeys.slots(doctorId, date),
    queryFn: () => fetchSlots(doctorId, date),
    enabled: !!date,
  });
  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">
        Date
        <input
          type="date"
          value={date}
          min={todayIST()}
          onChange={(e) => {
            onDate(e.target.value);
            onSlot('');
          }}
          className="input mt-1 max-w-xs"
        />
      </label>
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No free slots on this day. Try another date." />
      {!!data?.length && (
        <div className="flex flex-wrap gap-2">
          {data.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onSlot(s.id)}
              className={cn(
                'px-3 py-1.5 rounded-lg border text-sm',
                slotId === s.id ? 'bg-brand-600 border-brand-600 text-white' : 'border-gray-200 hover:border-brand-400'
              )}
            >
              {formatSlotTime(s.slot_start)} – {formatSlotTime(s.slot_end)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
