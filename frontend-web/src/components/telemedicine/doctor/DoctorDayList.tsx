'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { doctorCancelConsultation, doctorKeys, endConsultation } from '@/lib/telemedicine/doctorApi';
import type { DoctorConsultation } from '@/lib/telemedicine/types';
import { getApiErrorMessage } from '@/lib/apiErrors';
import ReasonDialog from '@/components/admin/ReasonDialog';
import JoinDialog from '../common/JoinDialog';
import { useJoin } from '../common/useConsultActions';
import DoctorConsultRow from './DoctorConsultRow';
import EndConsultDialog from './EndConsultDialog';

const paidOrFree = (c: DoctorConsultation) => c.payment_status === 'paid' || c.payment_status === 'waived';

/** Join (starts the consultation), end with notes, cancel with a reason — the patient's paid fee is refunded. */
export default function DoctorDayList({ rows }: { rows: DoctorConsultation[] }) {
  const queryClient = useQueryClient();
  const { join, room, closeRoom } = useJoin(doctorKeys.all);
  const [ending, setEnding] = useState<DoctorConsultation | null>(null);
  const [cancelling, setCancelling] = useState<DoctorConsultation | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: doctorKeys.all });

  const end = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) => endConsultation(id, notes || undefined),
    onSuccess: () => {
      toast.success('Consultation ended');
      setEnding(null);
    },
    onSettled: refresh,
  });
  const cancel = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => doctorCancelConsultation(id, reason),
    onSuccess: (r) => {
      toast.success(r.refund ? 'Cancelled; the patient’s fee is being refunded' : 'Cancelled');
      setCancelling(null);
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not cancel')),
    onSettled: refresh,
  });

  return (
    <div className="space-y-3">
      {rows.map((c) => (
        <DoctorConsultRow
          key={c.id}
          c={c}
          actions={
            <>
              {['booked', 'in_progress'].includes(c.status) && paidOrFree(c) && (
                <button
                  onClick={() => join.mutate(c.id)}
                  disabled={join.isPending}
                  className="btn-primary text-xs py-1.5 px-3 inline-flex items-center gap-1"
                >
                  {join.isPending && join.variables === c.id && <Loader2 className="w-3 h-3 animate-spin" />}
                  {c.status === 'in_progress' ? 'Rejoin' : 'Start / join'}
                </button>
              )}
              {c.status === 'in_progress' && (
                <button onClick={() => setEnding(c)} className="btn-outline text-xs py-1.5 px-3">
                  End
                </button>
              )}
              {c.status === 'booked' && (
                <button onClick={() => setCancelling(c)} className="btn-outline text-xs py-1.5 px-3 text-red-600">
                  Cancel
                </button>
              )}
            </>
          }
        />
      ))}
      {room && <JoinDialog info={room} onClose={closeRoom} />}
      {ending && (
        <EndConsultDialog
          pending={end.isPending}
          error={end.error ? getApiErrorMessage(end.error, 'Could not end the consultation') : undefined}
          onClose={() => {
            setEnding(null);
            end.reset();
          }}
          onConfirm={(notes) => end.mutate({ id: ending.id, notes })}
        />
      )}
      {cancelling && (
        <ReasonDialog
          title="Cancel consultation"
          label="Reason (the patient is told)"
          confirmLabel="Cancel consultation"
          minLength={3}
          pending={cancel.isPending}
          onClose={() => setCancelling(null)}
          onConfirm={(reason) => cancel.mutate({ id: cancelling.id, reason })}
        />
      )}
    </div>
  );
}
