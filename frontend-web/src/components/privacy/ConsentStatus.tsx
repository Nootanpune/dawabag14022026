'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { describeNotice, privacyKeys, PURPOSE_LABELS, setMarketingConsent, type Consents } from '@/lib/privacy/api';
import { formatDateTimeIST } from '@/lib/admin/format';
import { getApiErrorMessage } from '@/lib/apiErrors';

/** Current consent per purpose; marketing can be withdrawn as easily as given (C-40). */
export default function ConsentStatus({ consents }: { consents: Consents }) {
  const queryClient = useQueryClient();
  const marketing = consents.current.find((c) => c.purpose === 'marketing');
  const others = consents.current.filter((c) => c.purpose !== 'marketing');

  const toggle = useMutation({
    mutationFn: (granted: boolean) => setMarketingConsent(granted),
    onSuccess: (c, granted) => {
      queryClient.setQueryData(privacyKeys.consents, c);
      toast.success(granted ? 'You will receive offers and health tips' : 'Marketing messages turned off');
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not update your choice')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: privacyKeys.consents }),
  });

  const granted = !!marketing?.granted;
  return (
    <div className="card mb-4">
      <h2 className="font-semibold text-sm mb-3">Your consents</h2>
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-gray-100">
        <div>
          <p className="text-sm font-medium">{PURPOSE_LABELS.marketing}</p>
          <p className="text-xs text-gray-500">
            {marketing ? `${granted ? 'On' : 'Off'} since ${formatDateTimeIST(marketing.recorded_at)}` : 'Not given'} · order and
            prescription messages are always sent
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={granted}
          aria-label="Marketing messages"
          disabled={toggle.isPending}
          onClick={() => toggle.mutate(!granted)}
          className={`relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-60 ${granted ? 'bg-brand-600' : 'bg-gray-300'}`}
        >
          {toggle.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin text-white absolute top-1 left-3.5" />
          ) : (
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${granted ? 'left-[22px]' : 'left-0.5'}`} />
          )}
        </button>
      </div>
      <ul className="text-sm pt-2 space-y-1">
        {others.map((c) => (
          <li key={c.purpose} className="flex justify-between gap-3">
            <span>{PURPOSE_LABELS[c.purpose] ?? c.purpose.replace(/_/g, ' ')}</span>
            <span className="text-xs text-gray-500">
              {c.granted ? 'Yes' : 'No'} · {formatDateTimeIST(c.recorded_at)}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-gray-400 mt-2">{describeNotice(consents.policy_version, consents.notice_language)}</p>
    </div>
  );
}
