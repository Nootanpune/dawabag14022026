'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Upload, CheckCircle2, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { getApiErrorMessage } from '@/lib/apiErrors';

interface Props {
  orderId: string;
  onDone: () => void;
}

export default function PrescriptionStep({ orderId, onDone }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: rxData } = useQuery({
    queryKey: ['prescriptions'],
    queryFn: async () => {
      const { data } = await api.get('/prescriptions/my');
      return data.data as any[];
    },
  });
  const validSaved = (rxData ?? []).filter((r) => r.status === 'verified' && new Date(r.valid_until) > new Date());

  const handleContinue = async () => {
    if (!file && !savedId) {
      toast.error('Please upload a prescription or select a saved one');
      return;
    }
    if (file) {
      setUploading(true);
      try {
        const form = new FormData();
        form.append('prescription', file);
        form.append('order_id', orderId);
        await api.post('/prescriptions/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
        toast.success('Prescription uploaded');
      } catch (err) {
        toast.error(getApiErrorMessage(err, 'Upload failed'));
        return;
      } finally {
        setUploading(false);
      }
    }
    onDone();
  };

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
        <Upload className="w-5 h-5 text-brand-600" /> Upload prescription
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
          }}
        />
      </label>

      {validSaved.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-medium text-gray-700 mb-2">Or use a saved prescription</p>
          {validSaved.map((rx) => (
            <button
              key={rx.id}
              onClick={() => {
                setSavedId(rx.id);
                setFile(null);
              }}
              className={`w-full text-left p-3 rounded-xl border-2 transition-colors mb-2
                ${savedId === rx.id ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-300'}`}
            >
              <p className="text-sm font-medium text-brand-700">
                {rx.doctor_name ? `Dr. ${rx.doctor_name}` : 'Uploaded prescription'}
              </p>
              <p className="text-xs text-gray-500">
                Valid until {new Date(rx.valid_until).toLocaleDateString('en-IN')}
              </p>
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
        Our pharmacist will call to verify your prescription before dispatch.
      </div>

      <button
        onClick={handleContinue}
        disabled={uploading || (!file && !savedId)}
        className="btn-primary w-full mt-5 py-3 flex items-center justify-center gap-2"
      >
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        Continue to payment <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
