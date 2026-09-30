import Link from 'next/link';
import { CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import type { CustomerType } from '@/lib/registration';

interface Props {
  customerType: CustomerType;
  /** true when the user chose "Finish later" with documents still outstanding */
  documentsIncomplete?: boolean;
}

export default function SubmittedScreen({ customerType, documentsIncomplete }: Props) {
  const days = customerType === 'b2b_wholesaler' ? '2–3' : '1–2';

  if (documentsIncomplete) {
    return (
      <div className="text-center">
        <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-7 h-7 text-amber-600" />
        </div>
        <h2 className="text-lg font-semibold mb-2">Account created — documents pending</h2>
        <p className="text-sm text-gray-600">
          Your mobile number is verified, but some KYC documents have not been uploaded yet. Your application will be
          sent for review once all required documents are uploaded.
        </p>
        <p className="text-sm text-gray-600 mt-3">
          Until then you can browse at retail prices but cannot place trade orders.
        </p>
        <Link href="/" className="btn-primary w-full py-2.5 mt-6 inline-flex items-center justify-center">
          Start browsing
        </Link>
      </div>
    );
  }

  return (
    <div className="text-center">
      <div className="w-14 h-14 rounded-full bg-brand-100 flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 className="w-7 h-7 text-brand-600" />
      </div>
      <h2 className="text-lg font-semibold mb-2">Application submitted</h2>
      <p className="text-sm text-gray-600">
        Our team will verify your documents within {days} working days. You&apos;ll get an SMS and email once
        approved.
      </p>
      <p className="inline-flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 mt-4">
        <Clock className="w-3.5 h-3.5" />
        Until then you can browse at retail prices but cannot place trade orders.
      </p>
      <Link href="/" className="btn-primary w-full py-2.5 mt-6 inline-flex items-center justify-center">
        Start browsing
      </Link>
    </div>
  );
}
