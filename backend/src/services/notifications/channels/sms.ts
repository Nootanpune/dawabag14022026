// SMS through MSG91's flow API. Indian operators deliver only DLT-registered
// templates (TRAI), so each message type maps to its registered template and
// the template's variables are filled from smsVariables() — free text is never sent.
// Setting sms.dlt_templates: { "<type>": { "template_id": "...", "vars": { "<msg91 var>": "<our var>" } } }
import { getSetting } from '../../settings.service';
import { ChannelResult } from './result';

interface DltTemplate { template_id: string; vars?: Record<string, string> }

export async function sendDltSms(mobile: string, type: string, values: Record<string, string>): Promise<ChannelResult> {
  if (!process.env.MSG91_AUTH_KEY) return { status: 'skipped', detail: 'MSG91 not configured' };
  const templates = await getSetting<Record<string, DltTemplate>>('sms.dlt_templates', {});
  const t = templates[type] ?? (type === 'otp' && process.env.MSG91_TEMPLATE_OTP ? { template_id: process.env.MSG91_TEMPLATE_OTP, vars: { otp: 'otp' } } : undefined);
  if (!t?.template_id) return { status: 'skipped', detail: `No DLT template registered for "${type}"` };
  const recipient: Record<string, string> = { mobiles: `91${mobile}` };
  for (const [msgVar, ours] of Object.entries(t.vars ?? {})) {
    if (values[ours] == null) return { status: 'skipped', detail: `Template for "${type}" needs ${ours}, which this message does not have` };
    recipient[msgVar] = values[ours];
  }
  try {
    const res = await fetch(`${process.env.MSG91_BASE_URL || 'https://control.msg91.com'}/api/v5/flow/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authkey: process.env.MSG91_AUTH_KEY },
      body: JSON.stringify({ template_id: t.template_id, short_url: '0', recipients: [recipient] }),
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok || body.type === 'error') return { status: 'failed', detail: String(body.message || res.statusText).slice(0, 500) };
    return { status: 'sent', ref: String(body.message ?? '') };
  } catch (err: any) {
    return { status: 'failed', detail: String(err?.message || err).slice(0, 500) };
  }
}
