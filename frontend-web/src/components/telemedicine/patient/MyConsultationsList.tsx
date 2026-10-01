'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cancelConsultation, teleKeys } from '@/lib/telemedicine/api';
import { payConsultation } from '@/lib/telemedicine/razorpay';
import type { MyConsultation } from '@/lib/telemedicine/types';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { formatPaise } from '@/lib/admin/format';
import ReasonDialog from '@/components/admin/ReasonDialog';
import ConsultationCard from './ConsultationCard';
import JoinDialog from '../common/JoinDialog';
import { useJoin } from '../common/useConsultActions';

const paidOrFree = (c: MyConsultation) => c.payment_status === 'paid' || c.payment_status === 'waived';

export default function MyConsultationsList({ rows }: { rows: MyConsultation[] }) {
  const queryClient = useQueryClient();
  const [cancelling, setCancelling] = useState<MyConsultation | null>(null);
  const { join, room, closeRoom } = useJoin(teleKeys.mine);

  const pay = useMutation({
    mutationFn: (c: MyConsultation) => payConsultation(c.id, `Consultation with Dr ${c.doctor_name}`),
    onSuccess: (paid) => paid && toast.success('Fee paid'),
    onError: (err) => toast.error(getApiErrorMessage(err, 'Payment could not be completed')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: teleKeys.mine }),
  });
  const cancel = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => cancelConsultation(id, reason),
    onSuccess: (r) => {
      toast.success(r.refund ? `Cancelled. ${formatPaise(r.refund.amount_paise)} will be refunded to your payment method.` : 'Cancelled');
      setCancelling(null);
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not cancel')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: teleKeys.mine }),
  });

  return (
    <div className="space-y-3">
      {rows.map((c) => (
        <ConsultationCard
          key={c.id}
          c={c}
          actions={
            <>
              {c.status === 'booked' && c.payment_status === 'unpaid' && (
                <button
                  onClick={() => pay.mutate(c)}
                  disabled={pay.isPending}
                  className="btn-primary text-xs py-1.5 px-3 inline-flex items-center gap-1"
                >
                  {pay.isPending && pay.variables?.id === c.id && <Loader2 className="w-3 h-3 animate-spin" />} Pay {formatPaise(c.fee_paise)}
                </button>
              )}
              {['booked', 'in_progress'].includes(c.status) && paidOrFree(c) && (
                <button
                  onClick={() => join.mutate(c.id)}
                  disabled={join.isPending}
                  className="btn-primary text-xs py-1.5 px-3 inline-flex items-center gap-1"
                >
                  {join.isPending && join.variables === c.id && <Loader2 className="w-3 h-3 animate-spin" />} Join
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
      {cancelling && (
        <ReasonDialog
          title="Cancel consultation"
          label="Why are you cancelling?"
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
