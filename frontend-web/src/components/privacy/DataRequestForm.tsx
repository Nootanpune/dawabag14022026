'use client';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createDataRequest, type DataRequestType } from '@/lib/privacy/api';
import { getApiErrorMessage } from '@/lib/apiErrors';

/** Ask Dawabag to correct or erase personal data (C-43, C-44); staff act on it from the admin queue. */
export default function DataRequestForm() {
  const [type, setType] = useState<DataRequestType>('correction');
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');

  const send = useMutation({
    mutationFn: () => createDataRequest(type, details.trim() || undefined),
    onSuccess: () => {
      toast.success(type === 'erasure' ? 'Erasure request received' : 'Correction request received');
      setDetails('');
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not send your request')),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (type === 'correction' && details.trim().length < 5) return setError('Tell us what needs correcting');
    if (type === 'erasure' && !window.confirm('Erasing your account signs you out and cannot be undone. Continue?')) return;
    setError('');
    send.mutate();
  };

  return (
    <form onSubmit={submit} className="card space-y-3">
      <h2 className="font-semibold text-sm">Correct or erase your data</h2>
      <div className="flex gap-4 text-sm">
        {(['correction', 'erasure'] as const).map((t) => (
          <label key={t} className="flex items-center gap-2">
            <input type="radio" name="request_type" checked={type === t} onChange={() => setType(t)} />
            {t === 'correction' ? 'Correct my data' : 'Erase my account'}
          </label>
        ))}
      </div>
      {type === 'erasure' && (
        <p className="text-xs text-amber-800 bg-amber-50 rounded-lg p-2">
          We remove your identity and contact details. Tax invoices, prescriptions and the Schedule H1 register are kept for the period the
          law requires. Orders in progress or unpaid credit must be closed first.
        </p>
      )}
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder={type === 'correction' ? 'What is wrong and what should it be?' : 'Reason (optional)'}
        className="input"
        aria-label="Details"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end">
        <button type="submit" disabled={send.isPending} className="btn-primary text-sm inline-flex items-center gap-2">
          {send.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Send request
        </button>
      </div>
    </form>
  );
}
