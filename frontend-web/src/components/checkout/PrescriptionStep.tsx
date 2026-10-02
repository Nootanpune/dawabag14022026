'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Upload, CheckCircle2, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/apiErrors';
import {
  fetchMyPrescriptions,
  offerSavedPrescription,
  prescriptionKeys,
  uploadPrescription,
  usableAtCheckout,
} from '@/lib/prescriptions/api';
import SavedPrescriptionList from './SavedPrescriptionList';

interface Props {
  orderId: string;
  onDone: () => void;
}

// Prescription for Schedule H / H1 lines (C-08): upload a new one, or offer a saved
// one (verified, or uploaded earlier and not yet checked). Either way a pharmacist
// checks it with this order before anything is dispensed.
export default function PrescriptionStep({ orderId, onDone }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const { data: rxData } = useQuery({ queryKey: prescriptionKeys.mine, queryFn: fetchMyPrescriptions });
  // Verified ones still valid, and ones uploaded on /prescriptions not yet checked (Sprint 25)
  const reusable = usableAtCheckout(rxData ?? []);

  const handleContinue = async () => {
    if (!file && !savedId) {
      setError('Upload a prescription or choose a saved one');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (file) {
        await uploadPrescription(file, orderId);
        toast.success('Prescription uploaded');
      } else if (savedId) {
        await offerSavedPrescription(savedId, orderId);
        toast.success('Prescription sent to our pharmacist with this order');
      }
      onDone();
    } catch (err) {
      // e.g. "This prescription does not cover: …" or "This prescription has expired"
      setError(getApiErrorMessage(err, file ? 'Upload failed' : 'Could not use this prescription'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
        <Upload className="w-5 h-5 text-brand-600" /> Prescription
      </h2>
      <p className="text-sm text-gray-500 mb-5">One or more medicines require a valid doctor&apos;s prescription.</p>

      <label className="block cursor-pointer">
        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors
            ${file ? 'border-brand-400 bg-brand-50' : 'border-gray-300 hover:border-brand-400 hover:bg-brand-50'}`}
        >
          {file ? (
            <>
              <CheckCircle2 className="w-10 h-10 text-brand-600 mx-auto mb-2" />
              <p className="font-medium text-sm text-brand-700">{file.name}</p>
              <p className="text-xs text-brand-500 mt-1">Tap to change</p>
            </>
          ) : (
            <>
              <Upload className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="font-medium text-sm text-gray-600">Upload prescription</p>
              <p className="text-xs text-gray-400 mt-1">JPEG, PNG or PDF · Max 10 MB</p>
            </>
          )}
        </div>
        <input
          type="file"
          accept="image/*,.pdf"
          className="hidden"
          onChange={(e) => {
            setFile(e.target.files?.[0] || null);
            setSavedId(null);
            setError('');
          }}
        />
      </label>

      {reusable.length > 0 && (
        <SavedPrescriptionList
          prescriptions={reusable}
          selectedId={savedId}
          onSelect={(id) => {
            setSavedId(id);
            setFile(null);
            setError('');
          }}
        />
      )}

      <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
        Our pharmacist will verify your prescription before dispatch.
      </div>

      {error && <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}

      <button
        onClick={handleContinue}
        disabled={busy || (!file && !savedId)}
        className="btn-primary w-full mt-5 py-3 flex items-center justify-center gap-2"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        Continue to payment <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
