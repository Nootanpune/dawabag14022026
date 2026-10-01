'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getApiErrorMessage, getApiFieldErrors } from '@/lib/apiErrors';
import type { ProductBody } from '@/lib/admin/products';

/** Shared mutation + error state for the new / edit product pages. */
export function useProductSave(save: (body: ProductBody) => Promise<unknown>, successText: string, onSaved: () => void) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: save,
    onSuccess: () => {
      toast.success(successText);
      onSaved();
    },
    onError: (err) => {
      setFieldErrors(getApiFieldErrors(err));
      setError(getApiErrorMessage(err, 'Could not save the product'));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'products'] }),
  });

  /** Run a client-built body, or show its validation error. */
  const submit = (built: { body?: ProductBody; error?: string }) => {
    setFieldErrors({});
    if (built.error || !built.body) return setError(built.error ?? 'Check the form');
    setError('');
    mutation.mutate(built.body);
  };

  return { submit, pending: mutation.isPending, error, fieldErrors };
}
