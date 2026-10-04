// src/services/notification.service.ts — the notification queue and the public
// helpers other modules use. Wording: notifications/templates.ts; channels:
// notifications/channels/*; sending and the delivery log: notifications/dispatcher.ts.
import Bull from 'bull';
import { logger } from '../config/logger';
import { queueOptions } from '../config/queues';
import { dispatchNotification } from './notifications/dispatcher';
import { NotificationPayload } from './notifications/templates';
import { sendDltSms } from './notifications/channels/sms';
import { escapeHtml, sendEmailMessage } from './notifications/channels/email';

export type { NotificationPayload } from './notifications/templates';

let notificationQueue: Bull.Queue | null = null;

export function getNotificationQueue(): Bull.Queue {
  if (!notificationQueue) {
    // Scoped to this deployment (QUEUE_PREFIX, config/queues.ts): another API stack on the
    // same Redis must not take these jobs and send them with its own settings (Sprint 47)
    notificationQueue = new Bull('notifications', {
      ...queueOptions(),
      defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 100, removeOnFail: 50 },
    });
    notificationQueue.process(async (job) => { await dispatchNotification(job.data); });
    notificationQueue.on('failed', (job, err) => logger.error(`Notification job ${job.id} failed:`, err));
  }
  return notificationQueue;
}

export async function queueNotification(data: NotificationPayload): Promise<void> {
  try {
    await getNotificationQueue().add(data, { priority: 1 });
  } catch (err) {
    logger.error('Failed to queue notification:', err);
  }
}

export async function stopNotificationQueue(): Promise<void> {
  if (notificationQueue) await notificationQueue.close().catch(() => undefined);
}

// OTPs go straight out (no queue): DLT template 'otp' with variable otp
export async function sendOTP(mobile: string, otp: string): Promise<void> {
  const r = await sendDltSms(mobile, 'otp', { otp });
  if (r.status !== 'sent') logger.warn(`OTP SMS to ${mobile.substring(0, 5)}XXXXX ${r.status}: ${r.detail ?? ''}`);
  else logger.info(`OTP sent to ${mobile.substring(0, 5)}XXXXX`);
}

export async function sendSMS(mobile: string, _message: string): Promise<void> {
  logger.warn(`Free-text SMS to ${mobile.substring(0, 5)}XXXXX not sent: only DLT templates are allowed (use queueNotification)`);
}

export async function sendEmail(to: string, subject: string, htmlBody: string): Promise<void> {
  const r = await sendEmailMessage(to, subject, htmlBody);
  if (r.status === 'failed') logger.error(`Email to ${to} failed: ${r.detail}`);
}

export async function sendWelcomeEmail(email: string, name: string): Promise<void> {
  await sendEmail(email, 'Welcome to Dawabag!',
    `<h2>Hi ${escapeHtml(name)},</h2>
     <p>Welcome to Dawabag — your trusted online pharmacy.</p>
     <p>Your account is ready.</p>
     <p>Team Dawabag</p>`);
}
