'use client';
import { DELIVERY_CHANNELS, DELIVERY_STATUSES } from '@/lib/notifications/api';
import type { DeliveryChannel, DeliveryFilter, DeliveryStatus } from '@/lib/notifications/types';

export default function DeliveryFilters({ value, onChange }: { value: DeliveryFilter; onChange: (f: DeliveryFilter) => void }) {
  return (
    <div className="card flex flex-wrap items-end gap-3 text-sm mb-4">
      <label className="block">
        <span className="block font-medium text-gray-700 mb-1">Status</span>
        <select value={value.status} onChange={(e) => onChange({ ...value, status: e.target.value as DeliveryStatus | '' })} className="input">
          <option value="">All</option>
          {DELIVERY_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="block font-medium text-gray-700 mb-1">Channel</span>
        <select value={value.channel} onChange={(e) => onChange({ ...value, channel: e.target.value as DeliveryChannel | '' })} className="input">
          <option value="">All</option>
          {DELIVERY_CHANNELS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
