// Sends one notification: stores it for the in-app inbox, then tries SMS, email
// and push, recording every attempt in notification_deliveries (sent / failed /
// skipped with the reason) so failures are visible to admins.
//
// Sprint 32 — never crashes the API. Before, each channel's promise was created first
// and only awaited (Promise.allSettled) after further awaits; when one rejected in
// between (e.g. writing its delivery row after the notification was deleted:
// notification_deliveries_notification_id_fkey, seen in Sprint 23) Node saw an
// unhandled rejection and stopped the process. Now every channel promise carries its
// own catch from the moment it is created, a failure is logged, and a delivery whose
// notification no longer exists is skipped.
import { logger } from '../../config/logger';
import { query, queryOne } from '../../config/database';
import { NotificationPayload, buildMessage, smsVariables } from './templates';
import { sendDltSms } from './channels/sms';
import { escapeHtml, sendEmailMessage } from './channels/email';
import { sendPushTo } from './channels/push';
import { sendWhatsApp, whatsappOptedIn } from './channels/whatsapp';
import { ChannelResult } from './channels/result';

/** Foreign-key violation on the delivery's notification: it was deleted meanwhile. */
export const isNotificationGone = (err: unknown) => {
  const e = err as { code?: string; constraint?: string } | null;
  return e?.code === '23503' && (!e.constraint || e.constraint === 'notification_deliveries_notification_id_fkey'
    || e.constraint === 'notification_deliveries_user_id_fkey');
};

/** Runs one channel; whatever happens, the returned promise resolves (logged, never thrown). */
export function safely(label: string, work: () => Promise<unknown>): Promise<void> {
  let p: Promise<unknown>;
  try { p = work(); } catch (err) { p = Promise.reject(err); }
  return p.then(() => undefined, (err) => {
    if (isNotificationGone(err)) logger.info(`Notification ${label}: skipped, the notification or its user was removed meanwhile`);
    else logger.error(`Notification ${label} failed:`, err);
  });
}

export async function dispatchNotification(payload: NotificationPayload): Promise<void> {
  const user = await queryOne<{ mobile: string; email: string | null; deleted_at: Date | null }>(
    'SELECT mobile, email, deleted_at FROM users WHERE id = $1', [payload.userId]);
  if (!user || user.deleted_at) return;
  const message = buildMessage(payload);
  if (!message) return;

  // The inbox copy never carries the delivery code (it is shown live on the order)
  const { handoverCode, ...stored } = payload;
  const n = await queryOne<{ id: string }>(
    `INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [payload.userId, payload.type, message.push?.title || message.email?.subject || 'Dawabag update',
     message.push?.body || (handoverCode ? String(message.sms ?? '').replace(String(handoverCode), '******') : message.sms) || '', JSON.stringify(stored)]);

  // The delivery row is written only while its notification still exists; a delete
  // racing in between the check and the write is caught by safely() (FK 23503)
  const log = (channel: string, r: ChannelResult) => query(
    `INSERT INTO notification_deliveries (notification_id, user_id, type, channel, status, provider_ref, detail)
     SELECT $1, $2, $3, $4, $5, $6, $7
     WHERE $1::uuid IS NULL OR EXISTS (SELECT 1 FROM notifications WHERE id = $1::uuid)`,
    [n?.id ?? null, payload.userId, payload.type, channel, r.status, r.ref ?? null, r.detail ?? null]);

  const jobs: Promise<void>[] = [];
  if (message.sms) jobs.push(safely('sms', () => sendDltSms(user.mobile, payload.type, smsVariables(payload)).then((r) => log('sms', r))));
  // WhatsApp only for buyers who opted in, and only for types with an approved template
  jobs.push(safely('whatsapp', async () => {
    if (!(await whatsappOptedIn(payload.userId))) return;
    const r = await sendWhatsApp(user.mobile, payload.type, smsVariables(payload));
    if (r) await log('whatsapp', r);
  }));
  // Template bodies are plain text that can carry staff- or provider-supplied words (a
  // rejection reason, a product name, a failing job's error): escaped so none of it
  // becomes markup or a link in a mail sent from Dawabag's own address
  if (message.email && user.email) {
    const to = user.email;
    const { subject, body } = message.email;
    jobs.push(safely('email', () => sendEmailMessage(to, subject, escapeHtml(String(body ?? ''))).then((r) => log('email', r))));
  }
  if (message.push) {
    const { title, body } = message.push;
    jobs.push(safely('push', async () => {
      const devices = await query<{ fcm_token: string }>('SELECT fcm_token FROM user_devices WHERE user_id = $1', [payload.userId]);
      const rs = await sendPushTo(devices.map((d) => d.fcm_token), title, body, payload);
      for (const r of rs) await log('push', r);
    }));
  }
  await Promise.all(jobs);
}
