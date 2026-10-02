'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { FileCheck2, FileUp } from 'lucide-react';
import { fetchMyPrescriptions, prescriptionKeys, usableAtCheckout } from '@/lib/prescriptions/api';

/**
 * The cart has Schedule H / H1 medicines (C-08). Says whether the buyer already has
 * a prescription to choose at checkout, else links to the upload. Either way our
 * pharmacist checks it with the order before dispatch.
 */
export default function PrescriptionNotice() {
  const { data } = useQuery({ queryKey: prescriptionKeys.mine, queryFn: fetchMyPrescriptions });
  const usable = usableAtCheckout(data ?? []).length;

  return (
    <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm" data-testid="cart-rx-notice">
      {usable ? <FileCheck2 className="w-5 h-5 text-amber-700 mt-0.5 shrink-0" aria-hidden="true" />
        : <FileUp className="w-5 h-5 text-amber-700 mt-0.5 shrink-0" aria-hidden="true" />}
      <div className="flex-1">
        <p className="font-medium text-amber-900">Prescription required</p>
        {usable ? (
          <p className="text-amber-800 text-xs mt-0.5">
            You have {usable} uploaded prescription{usable === 1 ? '' : 's'} — you’ll pick it at checkout. Our pharmacist checks it before dispatch.
          </p>
        ) : (
          <p className="text-amber-800 text-xs mt-0.5">
            One or more medicines need a valid doctor’s prescription. Upload it now or at checkout. Our pharmacist checks it before dispatch.
          </p>
        )}
        <Link href="/prescriptions" className="inline-block mt-1.5 text-xs font-semibold text-brand-700 hover:underline">
          {usable ? 'Upload another prescription' : 'Upload now'}
        </Link>
      </div>
    </div>
  );
}
