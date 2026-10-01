// Shapes returned by GET /api/v1/admin/notification-deliveries (Sprint 8).
// Every SMS / email / push attempt is logged by the server; nothing is kept here.

export type DeliveryStatus = 'sent' | 'failed' | 'skipped';
export type DeliveryChannel = 'sms' | 'email' | 'push';

export interface NotificationDelivery {
  id: string;
  /** message type, e.g. payment_confirmed, dispatched */
  type: string;
  channel: DeliveryChannel;
  status: DeliveryStatus;
  provider_ref: string | null;
  /** reason for a failed or skipped attempt (e.g. no DLT template) */
  detail: string | null;
  created_at: string;
  user_name: string | null;
}

/** One (channel, status) count over the last 7 days */
export interface DeliveryCount {
  channel: DeliveryChannel;
  status: DeliveryStatus;
  n: number;
}

export interface DeliveryFilter {
  status: DeliveryStatus | '';
  channel: DeliveryChannel | '';
}

export interface DeliveriesResult {
  deliveries: NotificationDelivery[];
  last_7_days: DeliveryCount[];
}
