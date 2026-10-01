'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { privacyKeys, PURPOSE_LABELS, setOptionalConsent, type ConsentRecord, type OptionalPurpose } from '@/lib/privacy/api';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { formatDateTimeIST } from '@/lib/dates';

interface Props {
  purpose: OptionalPurpose;
  /** the latest record for this purpose from GET /privacy/consents (absent: never given) */
  record?: ConsentRecord;
  /** shown after the on/off line */
  note: string;
  onText: string;
  offText: string;
}

/** One optional consent, switched on or off as easily as it was given (C-40, C-42). */
export default function ConsentToggleRow({ purpose, record, note, onText, offText }: Props) {
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: (granted: boolean) => setOptionalConsent(purpose, granted),
    onSuccess: (c, granted) => {
      queryClient.setQueryData(privacyKeys.consents, c);
      toast.success(granted ? onText : offText);
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not update your choice')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: privacyKeys.consents }),
  });

  const granted = !!record?.granted;
  const label = PURPOSE_LABELS[purpose];
  return (
    <div className="flex items-start justify-between gap-3 py-3 border-b border-gray-100">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-gray-500">
          {record ? `${granted ? 'On' : 'Off'} since ${formatDateTimeIST(record.recorded_at)}` : 'Not given'} · {note}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={granted}
        aria-label={label}
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
  );
}
