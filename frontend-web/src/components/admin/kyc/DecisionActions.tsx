'use client';
import { useState } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import ReasonDialog from '../ReasonDialog';

interface Props {
  pending: boolean;
  onVerify: () => void;
  onFail: (reason: string) => void;
  verifyDisabled?: boolean;
  failTitle: string;
}

/** Verify / Fail buttons for one check; Fail asks for a mandatory reason. */
export default function DecisionActions({ pending, onVerify, onFail, verifyDisabled, failTitle }: Props) {
  const [failing, setFailing] = useState(false);
  return (
    <>
      <div className="flex gap-2 mt-3">
        <button
          onClick={onVerify}
          disabled={pending || verifyDisabled}
          className="btn-primary text-sm py-1.5 inline-flex items-center gap-1.5"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Verify
        </button>
        <button
          onClick={() => setFailing(true)}
          disabled={pending}
          className="border border-red-500 text-red-600 px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-red-50 inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <X className="w-4 h-4" /> Fail
        </button>
      </div>
      {failing && (
        <ReasonDialog
          title={failTitle}
          label="Reason (shown to the applicant)"
          confirmLabel="Mark failed"
          minLength={3}
          pending={pending}
          onClose={() => setFailing(false)}
          onConfirm={(reason) => {
            onFail(reason);
            setFailing(false);
          }}
        />
      )}
    </>
  );
}
