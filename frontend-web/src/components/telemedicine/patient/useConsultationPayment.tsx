'use client';
import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { payConsultation } from '@/lib/telemedicine/razorpay';
import { payConsultationDemo, type DemoChoice } from '@/lib/payments/api';
import { paidByLabel, type DemoOutcome } from '@/lib/payments/demoCheckout';
import { teleKeys } from '@/lib/telemedicine/api';
import { usePaymentOptions } from '@/hooks/usePaymentOptions';
import DemoPaymentDialog from '@/components/payments/DemoPaymentDialog';

interface Due { id: string; fee_paise: number; label: string }

/**
 * Paying a consultation fee the way this server takes payment (Sprint 26): Razorpay's
 * window, the trial's demo payment (no money moves), or a plain "not available" note.
 */
export function useConsultationPayment(): { pay: (c: Due) => Promise<void>; busyId: string | null; dialog: ReactNode } {
  const queryClient = useQueryClient();
  const { data: options } = usePaymentOptions();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [demoFor, setDemoFor] = useState<Due | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: teleKeys.all });

  const pay = async (c: Due) => {
    if (options?.mode === 'demo') { setDemoFor(c); return; }
    if (options?.mode !== 'razorpay') {
      toast.info('Online payment is not available right now. Please try again later.');
      return;
    }
    setBusyId(c.id);
    try {
      const paid = await payConsultation(c.id, c.label);
      if (paid) toast.success('Fee paid');
      else toast.message('Payment window closed. Nothing was charged; you can pay any time before the slot.');
    } catch (err) {
      toast.error(err instanceof Error && !(err as any).response ? err.message : getApiErrorMessage(err, 'The payment could not be completed. Please try again.'));
    } finally {
      setBusyId(null);
      refresh();
    }
  };

  // From the demo checkout's last screen; a decline is shown inside the dialog (Try again)
  const payDemo = async (choice: DemoChoice, outcome: 'success' | 'failure'): Promise<DemoOutcome> => {
    if (!demoFor) return 'error';
    try {
      const r = await payConsultationDemo(demoFor.id, choice, outcome);
      if (r.paid) { toast.success(`Fee paid — ${paidByLabel(choice)}, no money moved`); setDemoFor(null); return 'paid'; }
      return 'not_paid';
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'We could not record the demo payment. Please try again.'));
      return 'error';
    } finally {
      refresh();
    }
  };

  const dialog = demoFor && options ? (
    <DemoPaymentDialog title={`Pay for: ${demoFor.label}`} amountPaise={demoFor.fee_paise} methods={options.methods}
      providers={options.providers} onPay={payDemo} onClose={() => setDemoFor(null)} />
  ) : null;
  return { pay, busyId, dialog };
}
