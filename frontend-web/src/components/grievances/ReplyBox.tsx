'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Send } from 'lucide-react';
import { grievanceKeys, postGrievanceMessage } from '@/lib/grievances/api';
import { getApiErrorMessage } from '@/lib/apiErrors';

/** Adds a message to the thread; a staff reply acknowledges the complaint (C-36). */
export default function ReplyBox({ grievanceId, placeholder }: { grievanceId: string; placeholder?: string }) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const [error, setError] = useState('');

  const send = useMutation({
    mutationFn: () => postGrievanceMessage(grievanceId, body.trim()),
    onSuccess: (g) => {
      setBody('');
      queryClient.setQueryData(grievanceKeys.one(grievanceId), g);
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not send your message')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['grievances'] }),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return setError('Write a message first');
    setError('');
    send.mutate();
  };

  return (
    <form onSubmit={submit} className="mt-4">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        maxLength={5000}
        placeholder={placeholder ?? 'Write a reply'}
        className="input"
        aria-label="Reply"
      />
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      <div className="flex justify-end mt-2">
        <button type="submit" disabled={send.isPending} className="btn-primary text-sm inline-flex items-center gap-2">
          {send.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send
        </button>
      </div>
    </form>
  );
}
