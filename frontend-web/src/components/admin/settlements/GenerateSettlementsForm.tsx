'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { generateSettlements, settlementKeys } from '@/lib/admin/settlements';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { formatPrice } from '@/lib/utils';

/** Generate settlement batches for delivered partner shipments in a date range. */
export default function GenerateSettlementsForm() {
  const queryClient = useQueryClient();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');

  const generate = useMutation({
    mutationFn: () => generateSettlements({ period_from: from, period_to: to }),
    onSuccess: (res) => {
      const total = res.batches.reduce((sum, b) => sum + Number(b.net_payable_paise), 0);
      toast.success(
        res.batches.length
          ? `${res.batches.length} batch(es) generated · net ${formatPrice(total)}`
          : 'Nothing to settle in that period'
      );
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not generate settlements')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: settlementKeys.all }),
  });

  const submit = () => {
    if (!from || !to) return setError('Choose both dates');
    if (from > to) return setError('“From” must be on or before “To”');
    setError('');
    generate.mutate();
  };

  return (
    <div className="card mb-4">
      <p className="text-sm font-semibold mb-2">Generate settlements</p>
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="block">
          <span className="block text-xs text-gray-500 mb-1">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" />
        </label>
        <label className="block">
          <span className="block text-xs text-gray-500 mb-1">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input" />
        </label>
        <button onClick={submit} disabled={generate.isPending} className="btn-primary text-sm inline-flex items-center gap-2">
          {generate.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Generate
        </button>
      </div>
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
    </div>
  );
}
