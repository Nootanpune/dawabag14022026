'use client';
import { useQuery } from '@tanstack/react-query';
import { fetchRiders, riderKeys, riderLabel } from '@/lib/fulfilment/riders';
import { getApiErrorMessage } from '@/lib/apiErrors';

interface Props {
  value: string;
  onChange: (riderId: string) => void;
  /** leave this rider out (reassigning to someone else) — unknown on the queue, so optional */
  excludeId?: string;
}

/** Dawabag's own riders from GET /fulfilment/riders (Sprint 13, C-26). */
export default function RiderSelect({ value, onChange, excludeId }: Props) {
  const { data, isLoading, error } = useQuery({ queryKey: riderKeys.riders, queryFn: fetchRiders });
  const riders = (data ?? []).filter((r) => r.id !== excludeId);
  return (
    <label className="block">
      <span className="block font-medium text-gray-700 mb-1">Rider</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input" disabled={isLoading}>
        <option value="">{isLoading ? 'Loading riders…' : 'Choose a rider'}</option>
        {riders.map((r) => (
          <option key={r.id} value={r.id}>
            {riderLabel(r)}
          </option>
        ))}
      </select>
      {error ? (
        <span className="block text-xs text-red-600 mt-1">{getApiErrorMessage(error, 'Could not load riders')}</span>
      ) : !isLoading && !riders.length ? (
        <span className="block text-xs text-gray-400 mt-1">No active delivery staff. Add a user with the delivery role first.</span>
      ) : null}
    </label>
  );
}
