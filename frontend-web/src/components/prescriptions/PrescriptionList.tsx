'use client';
import { FileText, Loader2 } from 'lucide-react';
import type { MyPrescription } from '@/lib/prescriptions/api';
import EmptyState from '@/components/ui/EmptyState';
import PrescriptionRow from './PrescriptionRow';

interface Props {
  prescriptions: MyPrescription[] | undefined;
  isLoading: boolean;
}

/** The buyer's prescriptions, newest first, as the server holds them. */
export default function PrescriptionList({ prescriptions, isLoading }: Props) {
  return (
    <section aria-labelledby="my-rx-heading" aria-busy={isLoading}>
      <h2 id="my-rx-heading" className="text-base font-semibold text-gray-900 mb-3">Your prescriptions</h2>
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-400" aria-label="Loading" /></div>
      ) : !prescriptions?.length ? (
        <EmptyState icon={FileText} as="h3" title="No prescriptions yet" hint="Upload one above. It stays in your account for your next orders." />
      ) : (
        <ul className="space-y-3">
          {prescriptions.map((rx) => <PrescriptionRow key={rx.id} rx={rx} />)}
        </ul>
      )}
    </section>
  );
}
