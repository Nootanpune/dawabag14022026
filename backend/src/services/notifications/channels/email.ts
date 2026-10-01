// Email through AWS SES (SDK v3) via nodemailer
import nodemailer from 'nodemailer';
import SESTransport from 'nodemailer/lib/ses-transport';
import * as aws from '@aws-sdk/client-ses';
import { ChannelResult } from './result';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    const ses = new aws.SESClient({ region: process.env.AWS_REGION || 'ap-south-1' });
    transporter = nodemailer.createTransport({ SES: { ses, aws } } as unknown as SESTransport.Options);
  }
  return transporter;
}

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function wrap(subject: string, body: string): string {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
    <div style="background:#1A8856;padding:16px;border-radius:8px 8px 0 0;text-align:center">
      <h1 style="color:white;margin:0;font-size:24px">Dawabag</h1>
      <p style="color:#C6EFD9;margin:4px 0 0;font-size:12px">Online Pharmacy</p>
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
    const info = await getTransporter().sendMail({ from: `Dawabag <${process.env.AWS_SES_FROM_EMAIL}>`, to, subject, html: wrap(subject, htmlBody) });
    return { status: 'sent', ref: String(info.messageId ?? '') };
  } catch (err: any) {
    return { status: 'failed', detail: String(err?.message || err).slice(0, 500) };
  }
}
