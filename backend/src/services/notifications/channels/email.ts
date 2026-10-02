// Email through the AWS SES API (SDK v3), called directly — no SMTP library in between
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { ChannelResult } from './result';
import { BRAND, publicWebUrl } from '../../../utils/brand';

let client: SESClient | null = null;
const ses = () => (client ??= new SESClient({ region: process.env.AWS_REGION || 'ap-south-1' }));

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

// DAWA BAG header (owner's brand, 2026-10-02): the logo is linked from the website
// (frontend-web/public/brand) — nothing attached; the alt text reads "DAWA BAG"
function wrap(subject: string, body: string): string {
  const logo = `${escapeHtml(publicWebUrl())}/brand/dawabag-logo-email.png`;
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
    <div style="background:#ffffff;padding:16px;border:1px solid #e0e0e0;border-bottom:4px solid ${BRAND.teal};border-radius:8px 8px 0 0;text-align:center">
      <img src="${logo}" width="180" height="83" alt="DAWA BAG" style="display:inline-block;border:0;color:${BRAND.tealText};font-size:24px;font-weight:bold">
      <p style="color:${BRAND.grey};margin:6px 0 0;font-size:12px">Your Life Saving Companion</p>
    </div>
    <div style="background:#fff;padding:24px;border:1px solid #e0e0e0;border-top:none">${body}</div>
    <div style="background:#f5f5f5;padding:12px;border-radius:0 0 8px 8px;text-align:center">
      <p style="color:#888;font-size:12px;margin:0">© ${new Date().getFullYear()} Dawabag | ${escapeHtml(subject)} | This is an automated message</p>
    </div>
  </body></html>`;
}

export async function sendEmailMessage(to: string, subject: string, htmlBody: string): Promise<ChannelResult> {
  if (!process.env.AWS_SES_FROM_EMAIL) return { status: 'skipped', detail: 'Email (SES) not configured' };
  try {
    const oneLine = subject.replace(/[\r\n]+/g, ' ').slice(0, 200);     // no header injection through the subject
    const out = await ses().send(new SendEmailCommand({
      Source: `Dawabag <${process.env.AWS_SES_FROM_EMAIL}>`,
      Destination: { ToAddresses: [to] },
      Message: { Subject: { Data: oneLine, Charset: 'UTF-8' }, Body: { Html: { Data: wrap(oneLine, htmlBody), Charset: 'UTF-8' } } },
    }));
    return { status: 'sent', ref: String(out.MessageId ?? '') };
  } catch (err: any) {
    return { status: 'failed', detail: String(err?.message || err).slice(0, 500) };
  }
}
