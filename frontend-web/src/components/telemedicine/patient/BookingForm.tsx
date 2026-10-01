'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { bookConsultation, teleKeys } from '@/lib/telemedicine/api';
import { payConsultation } from '@/lib/telemedicine/razorpay';
import { MODE_LABELS, MODES, TPG_CONSENT_TEXT } from '@/lib/telemedicine/labels';
import type { ConsultMode, Doctor } from '@/lib/telemedicine/types';
import { getApiErrorLines, getApiErrorMessage } from '@/lib/apiErrors';
import { formatPaise } from '@/lib/admin/format';
import { todayIST } from '@/lib/fulfilment/roles';
import { useAuthStore } from '@/store/authStore';
import ErrorLines from '../common/ErrorLines';
import SlotPicker from './SlotPicker';

/**
 * Book a slot: mode, chief complaint and recorded consent (TPG 2020), then pay
 * the fee. The server decides first / follow-up and which medicines may follow (C-23).
 */
export default function BookingForm({ doctor }: { doctor: Doctor }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { status, user } = useAuthStore();
  const [date, setDate] = useState(todayIST());
  const [slotId, setSlotId] = useState('');
  const [mode, setMode] = useState<ConsultMode>('video');
  const [complaint, setComplaint] = useState('');
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const book = useMutation({
    mutationFn: () =>
      bookConsultation({ doctor_id: doctor.id, slot_id: slotId, mode, chief_complaint: complaint.trim(), consent: true }),
    onSuccess: async (b) => {
      queryClient.invalidateQueries({ queryKey: teleKeys.all });
      toast.success('Consultation booked');
      if (b.payment_status === 'unpaid') {
        try {
          const paid = await payConsultation(b.id, `Consultation with Dr ${doctor.full_name}`);
          if (paid) toast.success('Fee paid');
          else toast.message('You can pay from My consultations before the slot.');
        } catch (err) {
          toast.error(getApiErrorMessage(err, 'Payment could not be completed. You can pay from My consultations.'));
        }
      }
      router.push('/account/consultations');
    },
    onError: (err) => setErrors(getApiErrorLines(err, 'Could not book the consultation')),
  });

  if (status !== 'signed_in') {
    return (
      <div className="card text-sm">
        <Link href="/auth/login" className="text-brand-600 font-medium hover:underline">
          Log in
        </Link>{' '}
        to book a consultation.
      </div>
    );
  }
  if (user?.role !== 'customer') {
    return <div className="card text-sm text-gray-600">Consultations are booked from a patient account.</div>;
  }

  const submit = () => {
    const problems: string[] = [];
    if (!slotId) problems.push('Choose a slot');
    if (complaint.trim().length < 3) problems.push('Describe your main problem (at least 3 characters)');
    if (!consent) problems.push('Tick the consent box to continue');
    setErrors(problems);
    if (!problems.length) book.mutate();
  };

  return (
    <div className="card space-y-5 text-sm">
      <SlotPicker doctorId={doctor.id} date={date} onDate={setDate} slotId={slotId} onSlot={setSlotId} />

      <fieldset>
        <legend className="block text-sm font-medium text-gray-700 mb-1">How would you like to consult?</legend>
        <div className="flex flex-wrap gap-3">
          {MODES.map((m) => (
            <label key={m} className="flex items-center gap-1.5">
              <input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} /> {MODE_LABELS[m]}
            </label>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          At a first consultation some medicines can be prescribed only by video; audio and chat allow fewer medicines.
        </p>
      </fieldset>

      <label className="block text-sm font-medium text-gray-700">
        Main problem
        <textarea
          value={complaint}
          onChange={(e) => setComplaint(e.target.value)}
          maxLength={1000}
          rows={3}
          className="input mt-1"
          placeholder="e.g. fever and sore throat for 3 days"
        />
      </label>

      <label className="flex items-start gap-2 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
        <span>{TPG_CONSENT_TEXT}</span>
      </label>

      <ErrorLines lines={errors} />

      <div className="flex items-center justify-between gap-3">
        <p>
          Fee <span className="font-semibold">{doctor.consultation_fee_paise ? formatPaise(doctor.consultation_fee_paise) : 'Free'}</span>
          <span className="text-xs text-gray-500"> · refunded in full if you cancel 2 hours before</span>
        </p>
        <button onClick={submit} disabled={book.isPending} className="btn-primary inline-flex items-center gap-2">
          {book.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          {doctor.consultation_fee_paise ? 'Book and pay' : 'Book'}
        </button>
      </div>
    </div>
  );
}
