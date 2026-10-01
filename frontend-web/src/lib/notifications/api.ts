// Notification delivery log (admin) — /api/v1/admin/notification-deliveries.
// The server keeps the latest 300 attempts and a 7-day per-channel summary.
import api from '../api';
import type { DeliveriesResult, DeliveryChannel, DeliveryFilter, DeliveryStatus } from './types';

export const notificationKeys = {
  deliveries: (f: DeliveryFilter) => ['admin', 'notification-deliveries', f.status, f.channel] as const,
};

export const DELIVERY_CHANNELS: { value: DeliveryChannel; label: string }[] = [
  { value: 'sms', label: 'SMS' },
  { value: 'email', label: 'Email' },
  { value: 'push', label: 'Push' },
];

export const DELIVERY_STATUSES: { value: DeliveryStatus; label: string }[] = [
  { value: 'sent', label: 'Sent' },
  { value: 'failed', label: 'Failed' },
  { value: 'skipped', label: 'Skipped' },
];

export async function fetchDeliveries(f: DeliveryFilter): Promise<DeliveriesResult> {
  const { data } = await api.get('/admin/notification-deliveries', {
    params: { status: f.status || undefined, channel: f.channel || undefined },
  });
  return { deliveries: data.data?.deliveries ?? [], last_7_days: data.data?.last_7_days ?? [] };
}
