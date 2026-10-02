'use client';
import { useQuery } from '@tanstack/react-query';
import { HeartPulse } from 'lucide-react';
import { fetchOrderHealthNote, healthKeys } from '@/lib/healthProfile/api';

/**
 * Allergies and conditions of the person the order is for (the buyer, or the family
 * member the order names), from the buyer's health profile — only if they consented
 * (C-41). For the pharmacist checking the prescription (C-08); each look is audited (C-46).
 */
export default function BuyerHealthNote({ orderId }: { orderId: string }) {
  const { data, isLoading } = useQuery({ queryKey: healthKeys.order(orderId), queryFn: () => fetchOrderHealthNote(orderId), gcTime: 0 });
  if (isLoading || !data) return null;
  if (!data.shared) {
    return <p className="text-xs text-gray-500 mb-3" data-testid="buyer-health-note">No health profile shared by this buyer.</p>;
  }
  const who = data.for === 'family_member'
    ? `${data.full_name} (${[data.relationship, data.age != null ? `${data.age} years` : null].filter(Boolean).join(', ')})`
    : 'Buyer';
  const row = (label: string, xs?: string[]) => (
    <p><span className="font-semibold">{label}:</span> {xs?.length ? xs.join(', ') : <span className="text-gray-500">none recorded</span>}</p>
  );
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 space-y-0.5 mb-3" data-testid="buyer-health-note">
      <p className="font-semibold flex items-center gap-1 text-sm"><HeartPulse className="w-4 h-4" aria-hidden="true" /> Health profile — {who}</p>
      {row('Allergies', data.allergies)}
      {row('Conditions', data.conditions)}
      {data.for === 'buyer' && row('Current medicines', data.current_medicines)}
    </div>
  );
}
