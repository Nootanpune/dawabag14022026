import Header from '@/components/layout/Header';
import VerifyCodeForm from '@/components/telemedicine/public/VerifyCodeForm';

// Public: any pharmacy can check a Dawabag e-prescription by its code (C-24). No login.
export default function VerifyEPrescriptionPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <h1 className="text-lg font-semibold">Check an e-prescription</h1>
        <p className="text-sm text-gray-600">Enter the code printed on the e-prescription to see whether it is genuine and still valid.</p>
        <VerifyCodeForm />
      </div>
    </div>
  );
}
