'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellPlus } from 'lucide-react';
import { toast } from 'sonner';
import Header from '@/components/layout/Header';
import BackLink from '@/components/admin/BackLink';
import QueryState from '@/components/admin/QueryState';
import ReminderCard from '@/components/reminders/ReminderCard';
import ReminderForm from '@/components/reminders/ReminderForm';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { formatDateIST } from '@/lib/dates';
import {
  createReminder, fetchReminderSuggestions, fetchReminders, reminderKeys, type ReminderInput,
} from '@/lib/reminders/api';

// "My medicines" (Sprint 33): dose reminders kept on the server; the Dawabag app sets
// phone alerts from this list. Taken / Skipped answers are saved on the server too.
export default function MyMedicinesPage() {
  const queryClient = useQueryClient();
  const reminders = useQuery({ queryKey: reminderKeys.all, queryFn: fetchReminders });
  const suggestions = useQuery({ queryKey: reminderKeys.suggestions, queryFn: fetchReminderSuggestions });
  const [adding, setAdding] = useState<Partial<ReminderInput> | null>(null);
  const [error, setError] = useState('');
  const create = useMutation({
    mutationFn: createReminder,
    onSuccess: () => {
      toast.success('Reminder saved');
      setAdding(null);
      setError('');
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
    },
    onError: (e) => setError(getApiErrorMessage(e, 'Could not save the reminder')),
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <BackLink href="/account" label="My account" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-semibold">My medicines</h1>
          {!adding && (
            <button type="button" onClick={() => setAdding({})} className="btn-primary text-sm inline-flex items-center gap-1.5">
              <BellPlus className="w-4 h-4" /> Add a reminder
            </button>
          )}
        </div>
        <p className="text-sm text-gray-600">
          Set the times you take each medicine. The Dawabag app reminds you on your phone; mark each dose Taken or Skipped here or in the app.
          Reminders do not change your orders or prescriptions — follow your doctor’s advice.
        </p>
        {adding && (
          <ReminderForm initial={adding} pending={create.isPending} error={error} submitLabel="Save reminder"
            onCancel={() => { setAdding(null); setError(''); }} onSubmit={(v) => create.mutate(v)} />
        )}
        {!!suggestions.data?.length && !adding && (
          <section className="card text-sm" aria-labelledby="from-orders">
            <h2 id="from-orders" className="font-semibold mb-2">From your past orders</h2>
            <ul className="divide-y divide-gray-100">
              {suggestions.data.map((s) => (
                <li key={s.product_id} className="py-2 flex flex-wrap items-center gap-2">
                  <span className="flex-1 min-w-0">
                    {s.medicine_name}
                    <span className="block text-xs text-gray-500">Order {s.order_number}, {formatDateIST(s.ordered_at)}</span>
                  </span>
                  <button type="button" className="btn-outline text-xs py-1 px-3"
                    onClick={() => setAdding({ medicine_name: s.medicine_name, product_id: s.product_id, order_id: s.order_id })}>
                    Set reminder
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <QueryState isLoading={reminders.isLoading} error={reminders.error} isEmpty={!reminders.data?.length}
          emptyText="No reminders yet. Add one, or pick a medicine from your past orders." />
        <ul className="space-y-3">{reminders.data?.map((r) => <ReminderCard key={r.id} r={r} />)}</ul>
      </div>
    </div>
  );
}
