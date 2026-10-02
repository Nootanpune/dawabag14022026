'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { updateCreditLimit } from '@/lib/admin/credit';
import { rupeesToPaise } from '@/lib/admin/format';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { formatPrice } from '@/lib/utils';

interface Props {
  userId: string;
  creditLimitPaise: number;
  creditUsedPaise: number;
}

/** Credit limit for an approved retailer / wholesaler. UI in rupees, API in paise. */
export default function CreditLimitEditor({ userId, creditLimitPaise, creditUsedPaise }: Props) {
  const queryClient = useQueryClient();
  const [rupees, setRupees] = useState(String(creditLimitPaise / 100));
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: (credit_limit_paise: number) =>
      updateCreditLimit(userId, { credit_limit_paise, notes: notes.trim() || undefined }),
    onSuccess: (res) => {
      toast.success(`Credit limit set to ${formatPrice(res.credit_limit_paise)}`);
      setNotes('');
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not update credit limit')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });

  const submit = () => {
    const paise = rupeesToPaise(rupees);
    if (paise === null) return setError('Enter a valid amount in rupees');
    setError('');
    save.mutate(paise);
  };

  return (
    <div className="card">
      <h3 className="text-sm font-semibold mb-1">Credit limit</h3>
      <p className="text-xs text-gray-500 mb-3">
        Current limit {formatPrice(creditLimitPaise)} · used {formatPrice(creditUsedPaise)}
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex flex-1">
          <span className="inline-flex items-center px-3 rounded-l-full border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
            ₹
          </span>
          <input
            value={rupees}
            onChange={(e) => setRupees(e.target.value)}
            inputMode="decimal"
            className="input rounded-l-none"
            aria-label="Credit limit in rupees"
          />
        </div>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="input flex-1"
        />
        <button onClick={submit} disabled={save.isPending} className="btn-primary text-sm inline-flex items-center gap-2">
          {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Save
        </button>
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
