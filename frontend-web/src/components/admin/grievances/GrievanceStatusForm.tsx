'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { grievanceKeys, setGrievanceStatus, type GrievanceDetail } from '@/lib/grievances/api';
import { getApiErrorMessage } from '@/lib/apiErrors';

type NextStatus = 'in_progress' | 'resolved' | 'closed';

const OPTIONS: { value: NextStatus; label: string }[] = [
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

/** Staff status change; "resolved" must carry the resolution given to the buyer (C-36). */
export default function GrievanceStatusForm({ g }: { g: GrievanceDetail }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<NextStatus>(g.status === 'resolved' ? 'closed' : 'in_progress');
  const [resolution, setResolution] = useState('');
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: () => setGrievanceStatus(g.id, status, status === 'resolved' ? resolution.trim() : undefined),
    onSuccess: () => {
      toast.success(`${g.ticket_no} marked ${status.replace('_', ' ')}`);
      setResolution('');
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not change the status')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['grievances'] }),
  });

  if (g.status === 'closed') return <p className="text-sm text-gray-500">This complaint is closed.</p>;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'resolved' && resolution.trim().length < 3) return setError('Write the resolution given to the buyer');
    setError('');
    save.mutate();
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-sm">
        <span className="block font-medium text-gray-700 mb-1">Change status</span>
        <select value={status} onChange={(e) => setStatus(e.target.value as NextStatus)} className="input">
          {OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {status === 'resolved' && (
        <label className="block text-sm">
          <span className="block font-medium text-gray-700 mb-1">Resolution (shown to the buyer)</span>
          <textarea value={resolution} onChange={(e) => setResolution(e.target.value)} rows={4} maxLength={5000} className="input" />
        </label>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button type="submit" disabled={save.isPending} className="btn-primary text-sm w-full inline-flex items-center justify-center gap-2">
        {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Update status
      </button>
    </form>
  );
}
