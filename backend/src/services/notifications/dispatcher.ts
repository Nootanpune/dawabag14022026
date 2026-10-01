// Sends one notification: stores it for the in-app inbox, then tries SMS, email
// and push, recording every attempt in notification_deliveries (sent / failed /
// skipped with the reason) so failures are visible to admins.
import { query, queryOne } from '../../config/database';
import { NotificationPayload, buildMessage, smsVariables } from './templates';
import { sendDltSms } from './channels/sms';
import { escapeHtml, sendEmailMessage } from './channels/email';
import { sendPushTo } from './channels/push';
import { sendWhatsApp, whatsappOptedIn } from './channels/whatsapp';
import { ChannelResult } from './channels/result';

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

  const log = (channel: string, r: ChannelResult) => query(
    `INSERT INTO notification_deliveries (notification_id, user_id, type, channel, status, provider_ref, detail)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`, [n?.id ?? null, payload.userId, payload.type, channel, r.status, r.ref ?? null, r.detail ?? null]);

  const jobs: Promise<unknown>[] = [];
  if (message.sms) jobs.push(sendDltSms(user.mobile, payload.type, smsVariables(payload)).then((r) => log('sms', r)));
  // WhatsApp only for buyers who opted in, and only for types with an approved template
  if (await whatsappOptedIn(payload.userId)) {
    jobs.push(sendWhatsApp(user.mobile, payload.type, smsVariables(payload)).then((r) => (r ? log('whatsapp', r) : undefined)));
  }
  // Template bodies are plain text that can carry staff- or provider-supplied words (a
  // rejection reason, a product name, a failing job's error): escaped so none of it
  // becomes markup or a link in a mail sent from Dawabag's own address
  if (message.email && user.email) jobs.push(sendEmailMessage(user.email, message.email.subject, escapeHtml(String(message.email.body ?? ''))).then((r) => log('email', r)));
  if (message.push) {
    const devices = await query<{ fcm_token: string }>('SELECT fcm_token FROM user_devices WHERE user_id = $1', [payload.userId]);
    jobs.push(sendPushTo(devices.map((d) => d.fcm_token), message.push.title, message.push.body, payload)
      .then((rs) => Promise.all(rs.map((r) => log('push', r)))));
  }
  await Promise.allSettled(jobs);
}
