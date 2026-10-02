'use client';
import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, FileUp, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { prescriptionFileProblem, prescriptionKeys, uploadPrescription } from '@/lib/prescriptions/api';

/**
 * Upload a prescription any time, without an order. The file goes straight to the
 * API and the server object store — nothing is kept in the browser. It is checked
 * by our pharmacist with the order before anything is dispensed (C-08).
 */
interface Props {
  /** told the new prescription's id once it is stored */
  onUploaded: (prescriptionId: string) => void;
  /** e.g. "Upload a new prescription" at checkout */
  title?: string;
  /** checkout: a lighter card inside the step */
  compact?: boolean;
}

export default function PrescriptionUploadCard({ onUploaded, title = 'Upload a prescription', compact }: Props) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = useMutation({
    mutationFn: (file: File) => uploadPrescription(file),
    onSuccess: async (rx: { id: string }) => {
      await queryClient.invalidateQueries({ queryKey: prescriptionKeys.mine });
      toast.success('Prescription uploaded');
      onUploaded(rx.id);
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Upload failed. Please try again.')),
  });

  const pick = (input: HTMLInputElement | null) => {
    const file = input?.files?.[0];
    if (input) input.value = '';     // the same file can be chosen again after an error
    if (!file) return;
    const problem = prescriptionFileProblem(file);
    setError(problem ?? '');
    if (!problem) upload.mutate(file);
  };

  return (
    <section aria-labelledby="upload-heading" className={compact ? 'rounded-xl border-2 border-dashed border-gray-300 p-4' : 'card'}>
      <h2 id="upload-heading" className="text-base font-semibold text-gray-900">{title}</h2>
      <p className="text-sm text-gray-600 mt-1">
        A clear photo or PDF of the whole prescription: doctor’s name and registration number, date, your name, and the medicines.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {/* Phones open the camera; computers show the file chooser */}
        <button type="button" onClick={() => cameraRef.current?.click()} disabled={upload.isPending}
          className="btn-primary inline-flex items-center justify-center gap-2 py-3">
          {upload.isPending ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Camera className="w-4 h-4" aria-hidden="true" />}
          Take a photo
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={upload.isPending}
          className="btn-outline inline-flex items-center justify-center gap-2 py-3">
          <FileUp className="w-4 h-4" aria-hidden="true" /> Choose a photo or PDF
        </button>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1}
        aria-label="Take a photo of your prescription" onChange={(e) => pick(e.currentTarget)} />
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,application/pdf" className="sr-only" tabIndex={-1}
        aria-label="Prescription file" onChange={(e) => pick(e.currentTarget)} />
      <p className="text-xs text-gray-500 mt-2">JPEG, PNG or PDF, up to 10 MB. Only you and our pharmacists can open it.</p>
      {upload.isPending && <p className="text-sm text-gray-600 mt-2" role="status">Uploading…</p>}
      {error && <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3" role="alert">{error}</p>}
    </section>
  );
}
