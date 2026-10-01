'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileCheck2, Loader2 } from 'lucide-react';
import { applyPrescription, fulfilmentKeys } from '@/lib/fulfilment/api';
import type { RxQueueItem } from '@/lib/fulfilment/types';
import { getApiErrorMessage } from '@/lib/apiErrors';
import PrescriptionViewer from './PrescriptionViewer';

// The buyer offered a saved, verified prescription at checkout (C-08). The pharmacist
// checks it and applies it; the server enforces owner, expiry and quantities left.
export default function OfferedRxNotice({ item }: { item: RxQueueItem & { requested_prescription_id: string } }) {
  const queryClient = useQueryClient();
  const [viewing, setViewing] = useState(false);
  const [error, setError] = useState('');
  const apply = useMutation({
    mutationFn: () => applyPrescription(item.requested_prescription_id, item.order_id),
    onSuccess: (r) => toast.success(`${item.order_number}: ${r.lines_covered} line(s) covered by the saved prescription`),
    onError: (err) => setError(getApiErrorMessage(err, 'Could not apply the prescription')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: fulfilmentKeys.all }),
  });

  return (
    <div className="mt-3 rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-medium text-brand-800">
          <FileCheck2 className="w-4 h-4" /> Buyer offered saved prescription
          <span className="font-mono text-xs text-gray-500">{item.requested_prescription_id.slice(0, 8)}</span>
        </span>
        <span className="flex gap-2">
          <button onClick={() => setViewing((v) => !v)} className="btn-outline text-xs py-1.5 px-3">
            {viewing ? 'Hide' : 'View'}
          </button>
          <button
            onClick={() => {
              setError('');
              apply.mutate();
            }}
            disabled={apply.isPending}
            className="btn-primary text-xs py-1.5 px-3 inline-flex items-center gap-1"
          >
            {apply.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Apply
          </button>
        </span>
      </div>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      {viewing && (
        <div className="mt-3">
          <PrescriptionViewer prescriptionId={item.requested_prescription_id} fileType={null} />
        </div>
      )}
    </div>
  );
}
