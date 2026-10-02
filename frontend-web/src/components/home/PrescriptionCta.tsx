import Link from 'next/link';
import { FileUp, Stethoscope, ChevronRight } from 'lucide-react';

// Upload a prescription any time on /prescriptions (Sprint 25); the buyer picks it at
// checkout and a pharmacist checks it with the order before anything is dispensed (C-08).
export default function PrescriptionCta() {
  return (
    <div className="grid gap-3 md:grid-cols-3 mb-6">
      <section className="md:col-span-2 card flex flex-col sm:flex-row sm:items-center gap-4 border-brand-200">
        <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
          <FileUp className="w-6 h-6 text-brand-600" aria-hidden="true" />
        </div>
        <div className="flex-1">
          <h2 className="font-semibold text-gray-900">Have a prescription?</h2>
          <p className="text-sm text-gray-600 mt-0.5">
            Upload a photo. Our pharmacist checks it before dispatch.
          </p>
          <p className="text-xs text-gray-500 mt-1">Then add the medicines to your cart and choose the prescription at checkout.</p>
        </div>
        <Link href="/prescriptions" className="btn-primary text-center whitespace-nowrap">
          Upload prescription
        </Link>
      </section>
      <Link
        href="/consult"
        className="card flex items-center gap-3 hover:border-brand-400 transition-colors"
      >
        <Stethoscope className="w-6 h-6 text-brand-600 shrink-0" aria-hidden="true" />
        <span className="flex-1">
          <span className="block font-medium text-gray-900">Consult a doctor</span>
          <span className="block text-xs text-gray-500">Registered doctors, online</span>
        </span>
        <ChevronRight className="w-4 h-4 text-gray-400" aria-hidden="true" />
      </Link>
    </div>
  );
}
