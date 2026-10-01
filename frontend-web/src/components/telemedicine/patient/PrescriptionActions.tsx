'use client';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, ShieldCheck, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { teleKeys, sendEPrescriptionToDawabag } from '@/lib/telemedicine/api';
import type { EPrescription } from '@/lib/telemedicine/types';
import { getApiErrorMessage } from '@/lib/apiErrors';
import EPrescriptionPdfButton from '../common/EPrescriptionPdfButton';

/**
 * PDF, public check link and the optional "order at Dawabag". The patient is free
 * to buy from any pharmacy (C-24: no steering of patients to Dawabag).
 */
export default function PrescriptionActions({ rx }: { rx: EPrescription }) {
  const queryClient = useQueryClient();
  const send = useMutation({
    mutationFn: () => sendEPrescriptionToDawabag(rx.id),
    onSuccess: () => toast.success('Sent to the Dawabag pharmacist. Add the medicines to your cart and check out as usual.'),
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not send the prescription')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: teleKeys.prescription(rx.id) }),
  });

  return (
    <div className="card text-sm space-y-4">
      <div className="flex flex-wrap gap-2">
        <EPrescriptionPdfButton id={rx.id} />
        <Link
          href={`/eprescriptions/verify/${rx.verification_code}`}
          target="_blank"
          className="btn-outline text-sm inline-flex items-center gap-2"
        >
          <ShieldCheck className="w-4 h-4" /> Check code {rx.verification_code}
        </Link>
      </div>
      <p className="text-xs text-gray-600">
        Any pharmacy can check this prescription at <span className="font-mono">/eprescriptions/verify/{rx.verification_code}</span>.
      </p>
      <div className="border-t border-gray-100 pt-3">
        <p className="font-medium">You may buy these medicines from any pharmacy.</p>
        <p className="text-xs text-gray-500 mb-2">
          Ordering at Dawabag is optional. If you choose it, the prescription goes to our pharmacist, who checks it like any upload.
        </p>
        {rx.sent_to_dawabag ? (
          <p className="text-xs text-green-700">Sent to the Dawabag pharmacist, who checks it before your order is packed.</p>
        ) : (
          <button onClick={() => send.mutate()} disabled={send.isPending} className="btn-primary text-sm inline-flex items-center gap-2">
            {send.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingBag className="w-4 h-4" />} Order these at Dawabag
          </button>
        )}
      </div>
    </div>
  );
}
