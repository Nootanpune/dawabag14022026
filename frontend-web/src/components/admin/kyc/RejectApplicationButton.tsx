'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { rejectApplication } from '@/lib/admin/kyc';
import { getApiErrorMessage } from '@/lib/apiErrors';
import ReasonDialog from '../ReasonDialog';

export default function RejectApplicationButton({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const reject = useMutation({
    mutationFn: (reason: string) => rejectApplication(userId, reason),
    onSuccess: () => {
      toast.success('Application rejected');
      setOpen(false);
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not reject application')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'kyc'] }),
  });

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-sm font-medium text-red-600 hover:underline">
        Reject application
      </button>
      {open && (
        <ReasonDialog
          title="Reject application"
          label="Reason (at least 5 characters, sent to the applicant)"
          confirmLabel="Reject"
          minLength={5}
          pending={reject.isPending}
          onClose={() => setOpen(false)}
          onConfirm={(reason) => reject.mutate(reason)}
        />
      )}
    </>
  );
}
