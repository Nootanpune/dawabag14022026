import Bull from 'bull';
import { getRedis } from '../config/redis';
import { query } from '../config/database';
import { logger } from '../config/logger';
import nodemailer from 'nodemailer';
import AWS from 'aws-sdk';

// ─── Queue Setup ──────────────────────────────────────────────────────────────
let notificationQueue: Bull.Queue;

export function getNotificationQueue(): Bull.Queue {
  if (!notificationQueue) {
    notificationQueue = new Bull('notifications', {
      redis: process.env.REDIS_URL || 'redis://localhost:6379',
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });

    notificationQueue.process(async (job) => {
      await processNotification(job.data);
    });

    notificationQueue.on('failed', (job, err) => {
      logger.error(`Notification job ${job.id} failed:`, err);
    });
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

// ─── Process Notification ─────────────────────────────────────────────────────
async function processNotification(payload: NotificationPayload) {
  const user = await getUserContact(payload.userId);
  if (!user) return;

  const message = buildMessage(payload);
  if (!message) return;

  const promises: Promise<any>[] = [];

  // SMS
  if (user.mobile && message.sms) {
    promises.push(sendSMS(user.mobile, message.sms));
  }

  // Email
  if (user.email && message.email) {
    promises.push(sendEmail(user.email, message.email.subject, message.email.body));
  }

  // Push notification
  if (user.fcm_token && message.push) {
    promises.push(sendPush(user.fcm_token, message.push.title, message.push.body, payload));
  }

  // Save to DB
  promises.push(
    query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        payload.userId,
        payload.type,
        message.push?.title || message.email?.subject || 'Dawabag Update',
        message.push?.body || message.sms || '',
        JSON.stringify(payload),
      ]
    )
  );

  await Promise.allSettled(promises);
}

// ─── Message Builder ──────────────────────────────────────────────────────────
interface NotificationPayload {
  userId: string;
  type: string;
  orderId?: string;
  orderNumber?: string;
  status?: string;
  awbNumber?: string;
  trackingUrl?: string;
  reason?: string;
  [key: string]: any;
}

function buildMessage(payload: NotificationPayload) {
  const on = payload.orderNumber || '';

  const messages: Record<string, any> = {
    payment_confirmed: {
      sms: `Dawabag: Payment confirmed for order ${on}. Your order is being processed.`,
      email: {
        subject: `Order ${on} — Payment Confirmed`,
        body: `Your payment has been received. Order ID: ${on}`,
      },
      push: {
        title: 'Payment confirmed',
        body: `Order ${on} is being processed.`,
      },
    },
    rx_pending: {
      sms: `Dawabag: Order ${on} is pending prescription verification. Our pharmacist will call you shortly.`,
      push: { title: 'Prescription pending', body: `Expect a call for order ${on}.` },
    },
    rx_verified: {
      sms: `Dawabag: Prescription verified for order ${on}. Packing in progress.`,
      push: { title: 'Prescription verified', body: `Order ${on} is being packed.` },
    },
    rx_rejected: {
      sms: `Dawabag: Prescription for order ${on} could not be verified. Reason: ${payload.reason || 'Invalid prescription'}. Contact support.`,
      push: { title: 'Prescription rejected', body: `Order ${on} needs a valid prescription.` },
    },
    packed: {
      sms: `Dawabag: Order ${on} packed and ready for dispatch.`,
      push: { title: 'Order packed', body: `Order ${on} is ready to ship.` },
    },
    dispatched: {
      sms: `Dawabag: Order ${on} dispatched via ${payload.courierPartner || 'courier'}. Tracking: ${payload.trackingUrl || payload.awbNumber || 'N/A'}`,
      email: {
        subject: `Order ${on} — Dispatched`,
        body: `Your order has been dispatched. Tracking ID: ${payload.awbNumber}. Track: ${payload.trackingUrl}`,
      },
      push: { title: 'Order dispatched', body: `Track order ${on} — ${payload.awbNumber}` },
    },
    delivered: {
      sms: `Dawabag: Order ${on} delivered successfully. Thank you!`,
      push: { title: 'Delivered!', body: `Order ${on} has been delivered.` },
    },
    refill_reminder: {
      sms: `Dawabag: Time to refill your medicines from order ${on}. Shop now at dawabag.in`,
      push: { title: 'Refill reminder', body: `Your medicines from order ${on} are due for refill.` },
    },
    order_status: {
      sms: `Dawabag: Order ${on} status updated to ${payload.status}.`,
      push: { title: 'Order update', body: `Order ${on}: ${payload.status}` },
    },
  };

  return messages[payload.type] || null;
}

// ─── SMS via MSG91 ────────────────────────────────────────────────────────────
export async function sendSMS(mobile: string, message: string): Promise<void> {
  try {
    const response = await fetch('https://api.msg91.com/api/v5/flow/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authkey: process.env.MSG91_AUTH_KEY!,
      },
      body: JSON.stringify({
        template_id: process.env.MSG91_TEMPLATE_OTP,
        sender: process.env.MSG91_SENDER_ID || 'DAWABG',
        mobiles: `91${mobile}`,
        body: message,
      }),
    });

    if (!response.ok) {
      logger.warn(`SMS failed for ${mobile}: ${response.statusText}`);
    }
  } catch (err) {
    logger.error('SMS send error:', err);
  }
}

export async function sendOTP(mobile: string, otp: string): Promise<void> {
  const message = `${otp} is your Dawabag OTP. Valid for ${process.env.OTP_EXPIRY_MINUTES || 10} minutes. Do not share with anyone.`;
  await sendSMS(mobile, message);
  logger.info(`OTP sent to ${mobile.substring(0, 5)}XXXXX`);
}

// ─── Email via AWS SES / Nodemailer ───────────────────────────────────────────
let transporter: nodemailer.Transporter;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    const ses = new AWS.SES({ region: process.env.AWS_REGION });
    transporter = nodemailer.createTransport({
      SES: { ses, aws: AWS },
    });
  }
  return transporter;
}

export async function sendEmail(
  to: string,
  subject: string,
  htmlBody: string
): Promise<void> {
  try {
    await getTransporter().sendMail({
      from: `Dawabag <${process.env.AWS_SES_FROM_EMAIL}>`,
      to,
      subject,
      html: wrapEmailTemplate(subject, htmlBody),
    });
  } catch (err) {
    logger.error('Email send error:', err);
  }
}

export async function sendWelcomeEmail(email: string, name: string): Promise<void> {
  await sendEmail(
    email,
    'Welcome to Dawabag!',
    `<h2>Hi ${name},</h2>
     <p>Welcome to Dawabag — your trusted online pharmacy.</p>
     <p>Your account is ready. Use code <strong>${process.env.WELCOME_COUPON_CODE}</strong>
     for ${process.env.WELCOME_COUPON_DISCOUNT}% off your first order.</p>
     <p>Team Dawabag</p>`
  );
}

function wrapEmailTemplate(subject: string, body: string): string {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
    <div style="background:#1A8856;padding:16px;border-radius:8px 8px 0 0;text-align:center">
      <h1 style="color:white;margin:0;font-size:24px">Dawabag</h1>
      <p style="color:#C6EFD9;margin:4px 0 0;font-size:12px">Online Pharmacy</p>
    </div>
    <div style="background:#fff;padding:24px;border:1px solid #e0e0e0;border-top:none">
      ${body}
    </div>
    <div style="background:#f5f5f5;padding:12px;border-radius:0 0 8px 8px;text-align:center">
      <p style="color:#888;font-size:12px;margin:0">© 2025 Dawabag | This is an automated message</p>
    </div>
  </body></html>`;
}

// ─── Push Notification via FCM ────────────────────────────────────────────────
export async function sendPush(
  fcmToken: string,
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<void> {
  try {
    const response = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `key=${process.env.FCM_SERVER_KEY}`,
      },
      body: JSON.stringify({
        to: fcmToken,
        notification: { title, body, sound: 'default' },
        data: {
          ...data,
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
      }),
    });

    if (!response.ok) {
      logger.warn(`Push notification failed: ${response.statusText}`);
    }
  } catch (err) {
    logger.error('Push notification error:', err);
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────
async function getUserContact(userId: string) {
  const { queryOne } = await import('../config/database');
  return queryOne<{ mobile: string; email: string | null; fcm_token: string | null }>(
    'SELECT mobile, email, fcm_token FROM users WHERE id = $1',
    [userId]
  );
}
