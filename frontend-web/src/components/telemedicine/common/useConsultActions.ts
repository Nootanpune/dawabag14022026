'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { joinConsultation } from '@/lib/telemedicine/api';
import type { JoinInfo } from '@/lib/telemedicine/types';
import { getApiErrorMessage } from '@/lib/apiErrors';

/** Join (402 unpaid / 409 too early come back as messages) and remember the room details while the dialog is open. */
export function useJoin(invalidateKey: readonly unknown[]) {
  const queryClient = useQueryClient();
  const [room, setRoom] = useState<JoinInfo | null>(null);
  const join = useMutation({
    mutationFn: joinConsultation,
    onSuccess: (info) => setRoom(info),
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not open the consultation')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: invalidateKey }),
  });
  return { join, room, closeRoom: () => setRoom(null) };
}
