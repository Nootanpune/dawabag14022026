'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createGrievance, GRIEVANCE_CATEGORIES, type GrievanceCategory } from '@/lib/grievances/api';
import { fetchMyOrderChoices } from '@/lib/grievances/orderChoices';
import { getApiErrorMessage, getApiFieldErrors } from '@/lib/apiErrors';
import { formatDateIST } from '@/lib/dates';

/** Raise a complaint; the server issues the ticket number and deadlines (C-36). */
export default function NewComplaintForm({ initialOrderId }: { initialOrderId?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const orders = useQuery({ queryKey: ['grievances', 'order-choices'], queryFn: fetchMyOrderChoices });
  const [category, setCategory] = useState<GrievanceCategory>(initialOrderId ? 'order' : 'other');
  const [orderId, setOrderId] = useState(initialOrderId ?? '');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const create = useMutation({
    mutationFn: () =>
      createGrievance({ category, subject: subject.trim(), description: description.trim(), ...(orderId ? { order_id: orderId } : {}) }),
    onSuccess: (r) => {
      toast.success(`Complaint ${r.ticket_no} registered`);
      queryClient.invalidateQueries({ queryKey: ['grievances'] });
      router.push(`/account/complaints/${r.id}`);
    },
    onError: (err) => {
      setFieldErrors(getApiFieldErrors(err));
      setError(getApiErrorMessage(err, 'Could not register the complaint'));
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (subject.trim().length < 3) return setError('Subject must be at least 3 characters');
    if (description.trim().length < 10) return setError('Please describe the problem in at least 10 characters');
    setError('');
    setFieldErrors({});
    create.mutate();
  };

  const fe = (k: string) => fieldErrors[k] && <span className="text-xs text-red-500">{fieldErrors[k]}</span>;

  return (
    <form onSubmit={submit} className="card space-y-4">
      <label className="block text-sm">
        <span className="block font-medium text-gray-700 mb-1">What is it about?</span>
        <select value={category} onChange={(e) => setCategory(e.target.value as GrievanceCategory)} className="input">
          {GRIEVANCE_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        {fe('category')}
      </label>
      <label className="block text-sm">
        <span className="block font-medium text-gray-700 mb-1">Order (optional)</span>
        <select value={orderId} onChange={(e) => setOrderId(e.target.value)} className="input" disabled={orders.isLoading}>
          <option value="">Not about a specific order</option>
          {orders.data?.map((o) => (
            <option key={o.id} value={o.id}>
              {o.order_number} · {formatDateIST(o.created_at)}
            </option>
          ))}
        </select>
        {fe('order_id')}
      </label>
      <label className="block text-sm">
        <span className="block font-medium text-gray-700 mb-1">Subject</span>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} className="input" />
        {fe('subject')}
      </label>
      <label className="block text-sm">
        <span className="block font-medium text-gray-700 mb-1">Describe the problem</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} maxLength={5000} className="input" />
        {fe('description')}
      </label>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end">
        <button type="submit" disabled={create.isPending} className="btn-primary text-sm inline-flex items-center gap-2">
          {create.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Submit complaint
        </button>
      </div>
    </form>
  );
}
